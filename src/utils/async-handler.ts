import { Request, Response, NextFunction } from 'express';
import {AsyncFunction} from "@/types/index";

export const asyncHandler = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};
