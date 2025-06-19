// utils/arcjet.ts
import arcjet, {
    tokenBucket,
    fixedWindow,
    slidingWindow,
    shield,
    detectBot,
    validateEmail
} from "@arcjet/node";
import { Request, Response } from "express";

// Initialize base Arcjet instance
export const aj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        // Global shield protection against common attacks
        shield({
            mode: "LIVE", // Change to "DRY_RUN" for testing
        }),
        // Bot detection
        detectBot({
            mode: "LIVE",
            allow: [], // Specify allowed bots if needed
        }),
    ],
});

// Rate limiting configurations
export const signupRateLimit = tokenBucket({
    mode: "LIVE",
    characteristics: ["ip"],
    refillRate: 2, // 2 requests
    interval: 3600, // per hour (in seconds)
    capacity: 5, // burst capacity
});

export const signinRateLimit = slidingWindow({
    mode: "LIVE",
    characteristics: ["ip"],
    interval: 900, // 15 minutes (in seconds)
    max: 10, // max attempts
});

export const avatarUploadRateLimit = fixedWindow({
    mode: "LIVE",
    characteristics: ["userId"],
    window: "1h",
    max: 10, // max 10 avatar uploads per hour per user
});

export const profileUpdateRateLimit = fixedWindow({
    mode: "LIVE",
    characteristics: ["userId"],
    window: "1h",
    max: 20, // max 20 profile updates per hour per user
});

// Email validation with disposable email detection
export const emailProtection = validateEmail({
    mode: "LIVE",
    block: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"],
});

// Create separate Arcjet instances for different endpoints
export const signupAj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        shield({ mode: "LIVE" }),
        detectBot({ mode: "LIVE", allow: [] }),
        signupRateLimit,
        emailProtection,
    ],
});

export const signinAj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        shield({ mode: "LIVE" }),
        detectBot({ mode: "LIVE", allow: [] }),
        signinRateLimit,
    ],
});

export const avatarUploadAj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        shield({ mode: "LIVE" }),
        avatarUploadRateLimit,
    ],
});

export const profileUpdateAj = arcjet({
    key: process.env.ARCJET_KEY!,
    rules: [
        shield({ mode: "LIVE" }),
        profileUpdateRateLimit,
    ],
});

// Helper function to handle Arcjet decisions
export const handleArcjetDecision = (decision: any, res: Response) => {
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

// Helper function to get client IP
export const getClientIP = (req: Request): string => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        'unknown';
};

// Helper function to create request context for Arcjet
export const createArcjetContext = (req: Request, additionalData?: Record<string, any>) => {
    return {
        ip: getClientIP(req),
        method: req.method,
        protocol: req.protocol,
        host: req.get('host'),
        path: req.path,
        headers: req.headers,
        userId: (req as any).userId || undefined,
        ...additionalData
    };
};