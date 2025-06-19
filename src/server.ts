import "module-alias/register";
import cors from 'cors';
import config from '@/config';
import { Server } from '@overnightjs/core';
import { Logger } from '@overnightjs/logger';
import * as bodyParser from 'body-parser';
import { AuthController } from '@/controllers/auth-controllers';
import { UserController } from "@/controllers/user-controller";
import { NotFoundError } from '@/errors/app-error';
import { errorHandler } from '@/middlewares/error-handler';
import * as mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { setUpSocket } from "@/socket";
import { createServer, Server as HttpServer } from "http";
import {ContactController} from "@/controllers/contact-handlers";
import express from 'express';
import path from "path";
import type {Response , Request} from "express";

class AppServer extends Server {
  private readonly logger = new Logger();
  private httpServer!: HttpServer;

  constructor() {
    super(config.env === 'development');
    this.setupServer();
    this.setupControllers();
    this.setupErrorHandling(); // Move before database setup to handle errors properly
    this.setupDatabase();
    this.initSocket();
  }

  private initSocket(): void {
    // Create HTTP server using the Express app
    this.httpServer = createServer(this.app);

    // Setup Socket.io with the HTTP server
    setUpSocket(this.httpServer);
  }

  private setupServer(): void {
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true
    }));
    this.app.use(cookieParser());
    this.app.use(bodyParser.json({ limit: '10mb' })); // Add size limit for security
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
    this.app.get('/', (_req : Request, res : Response) => {
      res.status(200).json({ status: 'OK' });
    });
  }

  private setupControllers(): void {
    const authController = new AuthController();
    const userController = new UserController();
    const contactController = new ContactController();

    // Add controllers
    super.addControllers([
      authController,
      contactController,
      userController,
    ]);
  }

  private setupErrorHandling(): void {
    // Catch all undefined routes
    this.app.all('*', (req, _res, next) => {
      next(new NotFoundError(`Route ${req.originalUrl} not found`));
    });

    // Global error handler
    // @ts-ignore
    this.app.use(errorHandler);
  }

  private async setupDatabase(): Promise<void> {
    try {
      await mongoose.connect(config.database.url, {
        // Add these options for better connection handling
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        bufferCommands: false, // Disable mongoose buffering
      });
      this.logger.info('Database Connected Successfully');
    } catch (err) {
      const error = err as Error;
      this.logger.err(`Database Connection Error: ${error.message}`);
      throw new Error(`Database Connection Error: ${error.message}`);
    }
  }

  public async start(port: number): Promise<void> {
    try {
      // Ensure database is connected before starting server
      await this.setupDatabase();

      // Start the HTTP server (which includes Socket.io)
      this.httpServer.listen(port, () => {
        this.logger.info(`Server listening on port: ${port}`);
        this.logger.info(`Environment: ${config.env}`);
        this.logger.info(`CORS Origin: ${config.cors.origin}`);
      });

      // Handle server shutdown gracefully
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.err('Failed to start server:', !!error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
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
          } catch (error) {
            this.logger.err('Error closing database connection:', !!error);
          }

          process.exit(0);
        });
      });
    });
  }
}

// Initialize and start server
const initializeServer = async (): Promise<void> => {
  try {
    const server = new AppServer();
    const port = Number(config.port) || 3000;

    await server.start(port);
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
};

// Start the application
initializeServer().catch((error) => {
  console.error('Unhandled error during server initialization:', error);
  process.exit(1);
});