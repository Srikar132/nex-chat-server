"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToCloud = uploadFileToCloud;
exports.generateThumbnail = generateThumbnail;
// utils/fileUpload.ts
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const UPLOADS_DIR = path_1.default.join(process.cwd(), 'public/uploads');
const THUMBNAILS_DIR = path_1.default.join(UPLOADS_DIR, 'thumbnails');
// Ensure directories exist
async function ensureDirectories() {
    await fs_1.promises.mkdir(UPLOADS_DIR, { recursive: true });
    await fs_1.promises.mkdir(THUMBNAILS_DIR, { recursive: true });
}
// Save file to /public/uploads and return relative path
async function uploadFileToCloud(fileBuffer, fileName, _mimeType) {
    await ensureDirectories();
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${(0, uuid_1.v4)()}.${fileExtension}`;
    const filePath = path_1.default.join(UPLOADS_DIR, uniqueFileName);
    try {
        await fs_1.promises.writeFile(filePath, fileBuffer);
        // Return relative URL path to serve the file
        return `/uploads/${uniqueFileName}`;
    }
    catch (error) {
        console.error('Local file save error:', error);
        throw new Error('Failed to save file locally');
    }
}
// Save thumbnail to /public/uploads/thumbnails and return relative path
async function generateThumbnail(imageBuffer, _fileName) {
    await ensureDirectories();
    const uniqueFileName = `thumb_${(0, uuid_1.v4)()}.jpg`;
    const filePath = path_1.default.join(THUMBNAILS_DIR, uniqueFileName);
    try {
        const thumbnailBuffer = await (0, sharp_1.default)(imageBuffer)
            .resize(200, 200, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 80 })
            .toBuffer();
        await fs_1.promises.writeFile(filePath, thumbnailBuffer);
        return `/uploads/thumbnails/${uniqueFileName}`;
    }
    catch (error) {
        console.error('Thumbnail generation error:', error);
        throw new Error('Failed to generate thumbnail');
    }
}
