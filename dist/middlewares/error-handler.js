"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const logger_1 = require("@overnightjs/logger");
const app_error_1 = require("@/errors/app-error");
const logger = new logger_1.Logger();
const errorHandler = (err, 
// @ts-ignore
req, res, _next) => {
    logger.err(err);
    if (err instanceof app_error_1.AppError) {
        return res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        });
    }
    return res.status(500).json({
        status: 'error',
        message: 'Something went wrong',
        ...(process.env.NODE_ENV === 'development' && {
            actualError: err.message,
            stack: err.stack,
        }),
    });
};
exports.errorHandler = errorHandler;
