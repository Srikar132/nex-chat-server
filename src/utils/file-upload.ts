// utils/fileUpload.ts
import { promises as fs } from 'fs';
import  path from 'path';
import  sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.join(process.cwd(), 'public/uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

// Ensure directories exist
async function ensureDirectories() {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
}

// Save file to /public/uploads and return relative path
export async function uploadFileToCloud(
    fileBuffer: Buffer,
    fileName: string,
    _mimeType: string
): Promise<string> {
    await ensureDirectories();

    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const filePath = path.join(UPLOADS_DIR, uniqueFileName);

    try {
        await fs.writeFile(filePath, fileBuffer);

        // Return relative URL path to serve the file
        return `/uploads/${uniqueFileName}`;
    } catch (error) {
        console.error('Local file save error:', error);
        throw new Error('Failed to save file locally');
    }
}

// Save thumbnail to /public/uploads/thumbnails and return relative path
export async function generateThumbnail(
    imageBuffer: Buffer,
    _fileName: string
): Promise<string> {
    await ensureDirectories();

    const uniqueFileName = `thumb_${uuidv4()}.jpg`;
    const filePath = path.join(THUMBNAILS_DIR, uniqueFileName);

    try {
        const thumbnailBuffer = await sharp(imageBuffer)
            .resize(200, 200, { fit: 'cover', position: 'center' })
            .jpeg({ quality: 80 })
            .toBuffer();

        await fs.writeFile(filePath, thumbnailBuffer);

        return `/uploads/thumbnails/${uniqueFileName}`;
    } catch (error) {
        console.error('Thumbnail generation error:', error);
        throw new Error('Failed to generate thumbnail');
    }
}
