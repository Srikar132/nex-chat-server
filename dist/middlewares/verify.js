"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const async_handler_1 = require("@/utils/async-handler");
exports.VerifyToken = (0, async_handler_1.asyncHandler)(async (req, res, next) => {
    const token = req?.cookies?.authToken;
    if (!token) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }
    // @ts-ignore
    const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
    if (!payload) {
        return res.status(401).json({
            message: "Unauthorized"
        });
    }
    req.userId = payload.userId;
    next();
});
