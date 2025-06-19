"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const cors_1 = __importDefault(require("cors"));
const config_1 = __importDefault(require("@/config"));
const core_1 = require("@overnightjs/core");
const logger_1 = require("@overnightjs/logger");
const bodyParser = __importStar(require("body-parser"));
const auth_controllers_1 = require("@/controllers/auth-controllers");
const user_controller_1 = require("@/controllers/user-controller");
const app_error_1 = require("@/errors/app-error");
const error_handler_1 = require("@/middlewares/error-handler");
const mongoose = __importStar(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const socket_1 = require("@/socket");
const http_1 = require("http");
const contact_handlers_1 = require("@/controllers/contact-handlers");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
class AppServer extends core_1.Server {
    constructor() {
        super(config_1.default.env === 'development');
        this.logger = new logger_1.Logger();
        this.setupServer();
        this.setupControllers();
        this.setupErrorHandling(); // Move before database setup to handle errors properly
        this.setupDatabase();
        this.initSocket();
    }
    initSocket() {
        // Create HTTP server using the Express app
        this.httpServer = (0, http_1.createServer)(this.app);
        // Setup Socket.io with the HTTP server
        (0, socket_1.setUpSocket)(this.httpServer);
    }
    setupServer() {
        this.app.use((0, cors_1.default)({
            origin: config_1.default.cors.origin,
            credentials: true
        }));
        this.app.use((0, cookie_parser_1.default)());
        this.app.use(bodyParser.json({ limit: '10mb' })); // Add size limit for security
        this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
        this.app.get('/', (_req, res) => {
            res.status(200).json({ status: 'OK' });
        });
    }
    setupControllers() {
        const authController = new auth_controllers_1.AuthController();
        const userController = new user_controller_1.UserController();
        const contactController = new contact_handlers_1.ContactController();
        // Add controllers
        super.addControllers([
            authController,
            contactController,
            userController,
        ]);
    }
    setupErrorHandling() {
        // Catch all undefined routes
        this.app.all('*', (req, _res, next) => {
            next(new app_error_1.NotFoundError(`Route ${req.originalUrl} not found`));
        });
        // Global error handler
        // @ts-ignore
        this.app.use(error_handler_1.errorHandler);
    }
    async setupDatabase() {
        try {
            await mongoose.connect(config_1.default.database.url, {
                // Add these options for better connection handling
                maxPoolSize: 10, // Maintain up to 10 socket connections
                serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                bufferCommands: false, // Disable mongoose buffering
            });
            this.logger.info('Database Connected Successfully');
        }
        catch (err) {
            const error = err;
            this.logger.err(`Database Connection Error: ${error.message}`);
            throw new Error(`Database Connection Error: ${error.message}`);
        }
    }
    async start(port) {
        try {
            // Ensure database is connected before starting server
            await this.setupDatabase();
            // Start the HTTP server (which includes Socket.io)
            this.httpServer.listen(port, () => {
                this.logger.info(`Server listening on port: ${port}`);
                this.logger.info(`Environment: ${config_1.default.env}`);
                this.logger.info(`CORS Origin: ${config_1.default.cors.origin}`);
            });
            // Handle server shutdown gracefully
            this.setupGracefulShutdown();
        }
        catch (error) {
            this.logger.err('Failed to start server:', !!error);
            process.exit(1);
        }
    }
    setupGracefulShutdown() {
        // Handle shutdown signals
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                this.logger.info(`Received ${signal}, shutting down gracefully...`);
                // Close HTTP server
                this.httpServer.close(async () => {
                    this.logger.info('HTTP server closed');
                    // Close database connection
                    try {
                        await mongoose.connection.close();
                        this.logger.info('Database connection closed');
                    }
                    catch (error) {
                        this.logger.err('Error closing database connection:', !!error);
                    }
                    process.exit(0);
                });
            });
        });
    }
}
// Initialize and start server
const initializeServer = async () => {
    try {
        const server = new AppServer();
        const port = Number(config_1.default.port) || 3000;
        await server.start(port);
    }
    catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
};
// Start the application
initializeServer().catch((error) => {
    console.error('Unhandled error during server initialization:', error);
    process.exit(1);
});
