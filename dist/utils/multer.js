"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadAvatar = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        // For src folder structure, go up to project root then into uploads
        const uploadDir = path_1.default.join(process.cwd(), 'uploads/avatars');
        try {
            // Check if directory exists, create if it doesn't
            if (!fs_1.default.existsSync(uploadDir)) {
                fs_1.default.mkdirSync(uploadDir, { recursive: true });
                console.log('Created upload directory:', uploadDir);
            }
            cb(null, uploadDir);
        }
        catch (error) {
            console.error('Error creating upload directory:', error);
            cb(error, '');
        }
    },
    filename: (_req, file, cb) => {
        const uniqueName = `${(0, uuid_1.v4)()}-${Date.now()}${path_1.default.extname(file.originalname)}`;
        // console.log('Generated filename:', uniqueName);
        cb(null, uniqueName);
    }
});
exports.uploadAvatar = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (_req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
        }
    }
});
