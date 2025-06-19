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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArcjetContext = exports.getClientIP = exports.handleArcjetDecision = exports.profileUpdateAj = exports.avatarUploadAj = exports.signinAj = exports.signupAj = exports.emailProtection = exports.profileUpdateRateLimit = exports.avatarUploadRateLimit = exports.signinRateLimit = exports.signupRateLimit = exports.aj = void 0;
// utils/arcjet.ts
const node_1 = __importStar(require("@arcjet/node"));
// Initialize base Arcjet instance
exports.aj = (0, node_1.default)({
    key: process.env.ARCJET_KEY,
    rules: [
        // Global shield protection against common attacks
        (0, node_1.shield)({
            mode: "LIVE", // Change to "DRY_RUN" for testing
        }),
        // Bot detection
        (0, node_1.detectBot)({
            mode: "LIVE",
            allow: [], // Specify allowed bots if needed
        }),
    ],
});
// Rate limiting configurations
exports.signupRateLimit = (0, node_1.tokenBucket)({
    mode: "LIVE",
    characteristics: ["ip"],
    refillRate: 2, // 2 requests
    interval: 3600, // per hour (in seconds)
    capacity: 5, // burst capacity
});
exports.signinRateLimit = (0, node_1.slidingWindow)({
    mode: "LIVE",
    characteristics: ["ip"],
    interval: 900, // 15 minutes (in seconds)
    max: 10, // max attempts
});
exports.avatarUploadRateLimit = (0, node_1.fixedWindow)({
    mode: "LIVE",
    characteristics: ["userId"],
    window: "1h",
    max: 10, // max 10 avatar uploads per hour per user
});
exports.profileUpdateRateLimit = (0, node_1.fixedWindow)({
    mode: "LIVE",
    characteristics: ["userId"],
    window: "1h",
    max: 20, // max 20 profile updates per hour per user
});
// Email validation with disposable email detection
exports.emailProtection = (0, node_1.validateEmail)({
    mode: "LIVE",
    block: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"],
});
// Create separate Arcjet instances for different endpoints
exports.signupAj = (0, node_1.default)({
    key: process.env.ARCJET_KEY,
    rules: [
        (0, node_1.shield)({ mode: "LIVE" }),
        (0, node_1.detectBot)({ mode: "LIVE", allow: [] }),
        exports.signupRateLimit,
        exports.emailProtection,
    ],
});
exports.signinAj = (0, node_1.default)({
    key: process.env.ARCJET_KEY,
    rules: [
        (0, node_1.shield)({ mode: "LIVE" }),
        (0, node_1.detectBot)({ mode: "LIVE", allow: [] }),
        exports.signinRateLimit,
    ],
});
exports.avatarUploadAj = (0, node_1.default)({
    key: process.env.ARCJET_KEY,
    rules: [
        (0, node_1.shield)({ mode: "LIVE" }),
        exports.avatarUploadRateLimit,
    ],
});
exports.profileUpdateAj = (0, node_1.default)({
    key: process.env.ARCJET_KEY,
    rules: [
        (0, node_1.shield)({ mode: "LIVE" }),
        exports.profileUpdateRateLimit,
    ],
});
// Helper function to handle Arcjet decisions
const handleArcjetDecision = (decision, res) => {
    if (decision.isDenied()) {
        if (decision.reason.isRateLimit()) {
            return res.status(429).json({
                message: "Too many requests. Please try again later.",
                status: "error",
                retryAfter: decision.reason.resetTime
            });
        }
        if (decision.reason.isBot()) {
            return res.status(403).json({
                message: "Automated requests are not allowed.",
                status: "error"
            });
        }
        if (decision.reason.isEmail()) {
            return res.status(400).json({
                message: "Please provide a valid email address from a legitimate email provider.",
                status: "error"
            });
        }
        if (decision.reason.isShield()) {
            return res.status(403).json({
                message: "Request blocked for security reasons.",
                status: "error"
            });
        }
        // Generic denial
        return res.status(403).json({
            message: "Request denied for security reasons.",
            status: "error"
        });
    }
    return null;
};
exports.handleArcjetDecision = handleArcjetDecision;
// Helper function to get client IP
const getClientIP = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'unknown';
};
exports.getClientIP = getClientIP;
// Helper function to create request context for Arcjet
const createArcjetContext = (req, additionalData) => {
    return {
        ip: (0, exports.getClientIP)(req),
        method: req.method,
        protocol: req.protocol,
        host: req.get('host'),
        path: req.path,
        headers: req.headers,
        userId: req.userId || undefined,
        ...additionalData
    };
};
exports.createArcjetContext = createArcjetContext;
