import multer from "multer";
import path from "path";
import fs from "fs";
import {v4 as uuidv4} from "uuid";

const storage = multer.diskStorage({
    destination: (_req  :any, _file : any, cb : any) => {
        // For src folder structure, go up to project root then into uploads
        const uploadDir = path.join(process.cwd(), 'uploads/avatars');
        try {
            // Check if directory exists, create if it doesn't
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
                console.log('Created upload directory:', uploadDir);
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Error creating upload directory:', error);
            cb(error as Error, '');
        }
    },
    filename: (_req : any, file : any, cb : any) => {
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        // console.log('Generated filename:', uniqueName);
        cb(null, uniqueName);
    }
});

export const uploadAvatar = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (_req : any, file : any, cb : any) => {
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
        }
    }
});