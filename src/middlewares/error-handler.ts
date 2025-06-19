import { Logger } from '@overnightjs/logger';
import { NextFunction, Request, Response } from 'express';
import { AppError } from '@/errors/app-error';

const logger = new Logger();

export const errorHandler = (
  err: Error | AppError,
  // @ts-ignore
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.err(err);

  if (err instanceof AppError) {
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
