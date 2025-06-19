import {Controller, Delete, Get, Middleware, Post, Put} from '@overnightjs/core';
import type {Response , Request} from "express"
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken"
import {asyncHandler} from "@/utils/async-handler";
import config from "@/config";
import {User} from "@/models/user"
import {VerifyToken} from "@/middlewares/verify";
import {uploadAvatar as upload} from "@/utils/multer";
import fs from 'fs';
import path from "path";



@Controller('api/auth')
export class AuthController {

    private generateToken(userId  : string) : string {
        // @ts-ignore
        return jwt.sign(
            { userId },
            config.jwt.secret!,
            { expiresIn: config.jwt.expiresIn! }
        );
    }

    private setCookies(res : Response , userId : string) {
        const token = this.generateToken(userId);

        res.cookie("authToken", token, {
            httpOnly: true,
            maxAge: config.jwt.maxAge,
            secure: true, // Required for cross-origin cookies
            sameSite: 'none', // Allows cross-origin cookies
        });
    }

    @Post('signin')
    public signin = asyncHandler(
        async (req : Request, res : Response) => {
            const {email , password} = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    message: "All fields are required" ,
                    status: "error"
                });
            }

            const user = await User.findOne({email});

            if (!user) {
                return res.status(400).json({ message: "Email does not exist" , status : "error" });
            }

            const isPasswordMatched = await bcrypt.compare(password, user.password);

            if (!isPasswordMatched) {
                return res.status(400).json({ message: "Incorrect password" , status : "error"});
            }

            this.setCookies(res,user._id as string );

            return res.status(200).json({
                message: "Login successful",
                user: {
                    // @ts-ignore
                    ...user._doc,
                    password: undefined
                },
                status : "success"
            });
        }
    )

    @Post('signup')
    public signup = asyncHandler(
        async (req : Request, res : Response) => {
            const {name , email , password} = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    message: "All fields are required" ,
                    status: "error"
                });
            }

            const user = await User.findOne({email});

            if (user) {
                return res.status(400).json({ message: "Email already exists" , status : "error"});
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const newUser = await User.create({
                name,
                email,
                password: hashedPassword,
                about : "Hey! , I"
            });

            this.setCookies(res,newUser._id as string );

            return res.status(200).json({
                message: "Signup successful",
                user: {
                    // @ts-ignore
                    ...newUser._doc,
                    password: undefined
                },
                status : "success"
            });
        }
    )

    @Get('verify')
    @Middleware([VerifyToken])
    public verify = asyncHandler(
        async (req : Request, res : Response) => {
            const user = await User.findById(req.userId)
                .select('-password');

            if(!user) {
                return res.status(404).json({
                    message: "User not found" ,
                    status: "error"
                });
            }

            return res.status(200).json({
                message: "User found",
                user: {
                    // @ts-ignore
                    ...user._doc,
                },
                status : "success"
            });
        }
    )

    @Post('logout')
    public logout = asyncHandler(
        async (_req : Request, res : Response) => {
            res.clearCookie("authToken" , {
                httpOnly: true,
                secure: true, // Required for cross-origin cookies
                sameSite: 'none', // Allows cross-origin cookies
            });

            return res.status(200).json({
                message: "Logout successful",
                status : "success",
            })
        }
    )

    @Put('upload-avatar')
    @Middleware([VerifyToken, upload.single('avatar')])
    public updateAvatar = asyncHandler(
        async (req : Request, res : Response) => {
            const userId = req.userId;
            const file = req.file;



            if (!file) {
                return res.status(400).json({
                    status : "error",
                    message: 'No file uploaded'
                });
            }

                // Get current user to delete old avatar if exists
            const currentUser = await User.findById(userId);
            if (currentUser?.avatar) {
                try {
                    const oldAvatarPath = path.join(process.cwd(), 'uploads/avatars', path.basename(currentUser.avatar));

                    // Use synchronous unlink and handle errors properly
                    if (fs.existsSync(oldAvatarPath)) {
                        fs.unlinkSync(oldAvatarPath);
                    }
                } catch (error) {
                    console.warn('Failed to delete old avatar:', error);
                    // Don't throw error, just log warning
                }
            }

            // Generate avatar URL
            const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${file.filename}`;

            // Update user avatar in database with new option to return updated document
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { avatar: avatarUrl },
                { new: true } // This returns the updated document
            ).select('-password');

            if (!updatedUser) {
                return res.status(404).json({
                    status : "error",
                    message: 'User not found'
                });
            }

            console.log('User updated successfully');

            return res.status(200).json({
                status : "success",
                message: 'Avatar uploaded successfully',
                avatarUrl: avatarUrl,
                user: updatedUser
            });
        }
    )

    @Delete('delete-avatar')
    @Middleware([VerifyToken])
    public deleteAvatar = asyncHandler(
        async (req : Request, res : Response) => {
            const userId = req.userId;

            const currentUser = await User.findById(userId);
            if (!currentUser) {
                return res.status(404).json({
                    status : "error",
                    message: 'User not found'
                });
            }

            // Delete avatar file if exists
            if (currentUser.avatar) {
                try {
                    const avatarPath = path.join(process.cwd(), 'uploads/avatars', path.basename(currentUser.avatar));
                    if (fs.existsSync(avatarPath)) {
                        fs.unlinkSync(avatarPath);
                    }
                } catch (error) {
                    console.warn('Failed to delete avatar file:', error);
                    // Continue with database update even if file deletion fails
                }
            }

            // Update user avatar in database
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { avatar: undefined },
                { new: true }
            ).select('-password');

            return res.status(200).json({
                status : "success",
                message: 'Avatar removed successfully',
                user: updatedUser
            });

        }
    )

    @Put('update-name')
    @Middleware([VerifyToken])
    public updateName = asyncHandler(
        async (req: Request, res: Response) => {
            const userId = req.userId;
            const { name } = req.body;

            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    status : "error",
                    message: 'Name is required'
                });
            }

            if (name.trim().length > 50) {
                return res.status(400).json({
                    status : "error",
                    message: 'Name must be less than 50 characters'
                });
            }

            // Update user name in database
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { name: name.trim() },
                { new: true }
            ).select('-password');

            if (!updatedUser) {
                return res.status(404).json({
                    status : "error",
                    message: 'User not found'
                });
            }

            return res.status(200).json({
                status : "success",
                message: 'Name updated successfully',
                user: updatedUser
            });
        }
    )

    @Put('update-about')
    @Middleware([VerifyToken])
    public updateAbout = asyncHandler(
        async (req: Request, res: Response): Promise<void> => {
            const userId = req.userId;
            const { about } = req.body;

            if (about && about.length > 139) {
                res.status(400).json({
                    status : "error",
                    message: 'Bio must be less than 140 characters'
                });
                return;
            }

            // Update user bio in database
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { about: about || '' },
                { new: true }
            ).select('-password');

            if (!updatedUser) {
                res.status(404).json({
                    status : "error",
                    message: 'User not found'
                });
                return;
            }

            res.status(200).json({
                status : "success",
                message: 'Bio updated successfully',
                user: updatedUser
            });
        }
    )


    @Put('update-theme')
    @Middleware([VerifyToken])
    public updateTheme = asyncHandler(
        async (req: Request, res: Response): Promise<void> => {
            const userId = req.userId;
            const { theme } = req.body;

            if(!theme || !["dark" , "light" , "system"].includes(theme)) {
                res.status(400).json({
                    status : "error",
                    message: 'Theme does not exist'
                })
            }

            // Update user bio in database
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { theme  },
                { new: true }
            ).select('-password');

            if (!updatedUser) {
                res.status(404).json({
                    status : "error",
                    message: 'User not found'
                });
                return;
            }

            res.status(200).json({
                status : "success",
                message: 'Bio updated successfully',
                theme
            });
        }
    )
}