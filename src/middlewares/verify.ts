import jwt, {JwtPayload} from 'jsonwebtoken';
import {Request, Response, NextFunction} from "express";
import {asyncHandler} from "@/utils/async-handler";

export const VerifyToken = asyncHandler(async (req : Request, res : Response, next : NextFunction) => {
    const token = req?.cookies?.authToken;

    if(!token) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    // @ts-ignore
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    if(!payload) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }

    req.userId = payload.userId;
    next();
})