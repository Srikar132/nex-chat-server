"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const core_1 = require("@overnightjs/core");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const async_handler_1 = require("@/utils/async-handler");
const config_1 = __importDefault(require("@/config"));
const user_1 = require("@/models/user");
const verify_1 = require("@/middlewares/verify");
const multer_1 = require("@/utils/multer");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let AuthController = class AuthController {
    constructor() {
        this.signin = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({
                    message: "All fields are required",
                    status: "error"
                });
            }
            const user = await user_1.User.findOne({ email });
            if (!user) {
                return res.status(400).json({ message: "Email does not exist", status: "error" });
            }
            const isPasswordMatched = await bcryptjs_1.default.compare(password, user.password);
            if (!isPasswordMatched) {
                return res.status(400).json({ message: "Incorrect password", status: "error" });
            }
            this.setCookies(res, user._id);
            return res.status(200).json({
                message: "Login successful",
                user: {
                    // @ts-ignore
                    ...user._doc,
                    password: undefined
                },
                status: "success"
            });
        });
        this.signup = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({
                    message: "All fields are required",
                    status: "error"
                });
            }
            const user = await user_1.User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: "Email already exists", status: "error" });
            }
            const hashedPassword = await bcryptjs_1.default.hash(password, 12);
            const newUser = await user_1.User.create({
                name,
                email,
                password: hashedPassword,
                about: "Hey! , I"
            });
            this.setCookies(res, newUser._id);
            return res.status(200).json({
                message: "Signup successful",
                user: {
                    // @ts-ignore
                    ...newUser._doc,
                    password: undefined
                },
                status: "success"
            });
        });
        this.verify = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const user = await user_1.User.findById(req.userId)
                .select('-password');
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
            return res.status(200).json({
                message: "User found",
                user: {
                    // @ts-ignore
                    ...user._doc,
                },
                status: "success"
            });
        });
        this.logout = (0, async_handler_1.asyncHandler)(async (_req, res) => {
            res.clearCookie("authToken", {
                httpOnly: true,
                secure: true, // Required for cross-origin cookies
                sameSite: 'none', // Allows cross-origin cookies
            });
            return res.status(200).json({
                message: "Logout successful",
                status: "success",
            });
        });
        this.updateAvatar = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const userId = req.userId;
            const file = req.file;
            if (!file) {
                return res.status(400).json({
                    status: "error",
                    message: 'No file uploaded'
                });
            }
            // Get current user to delete old avatar if exists
            const currentUser = await user_1.User.findById(userId);
            if (currentUser?.avatar) {
                try {
                    const oldAvatarPath = path_1.default.join(process.cwd(), 'uploads/avatars', path_1.default.basename(currentUser.avatar));
                    // Use synchronous unlink and handle errors properly
                    if (fs_1.default.existsSync(oldAvatarPath)) {
                        fs_1.default.unlinkSync(oldAvatarPath);
                    }
                }
                catch (error) {
                    console.warn('Failed to delete old avatar:', error);
                    // Don't throw error, just log warning
                }
            }
            // Generate avatar URL
            const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${file.filename}`;
            // Update user avatar in database with new option to return updated document
            const updatedUser = await user_1.User.findByIdAndUpdate(userId, { avatar: avatarUrl }, { new: true } // This returns the updated document
            ).select('-password');
            if (!updatedUser) {
                return res.status(404).json({
                    status: "error",
                    message: 'User not found'
                });
            }
            console.log('User updated successfully');
            return res.status(200).json({
                status: "success",
                message: 'Avatar uploaded successfully',
                avatarUrl: avatarUrl,
                user: updatedUser
            });
        });
        this.deleteAvatar = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const userId = req.userId;
            const currentUser = await user_1.User.findById(userId);
            if (!currentUser) {
                return res.status(404).json({
                    status: "error",
                    message: 'User not found'
                });
            }
            // Delete avatar file if exists
            if (currentUser.avatar) {
                try {
                    const avatarPath = path_1.default.join(process.cwd(), 'uploads/avatars', path_1.default.basename(currentUser.avatar));
                    if (fs_1.default.existsSync(avatarPath)) {
                        fs_1.default.unlinkSync(avatarPath);
                    }
                }
                catch (error) {
                    console.warn('Failed to delete avatar file:', error);
                    // Continue with database update even if file deletion fails
                }
            }
            // Update user avatar in database
            const updatedUser = await user_1.User.findByIdAndUpdate(userId, { avatar: undefined }, { new: true }).select('-password');
            return res.status(200).json({
                status: "success",
                message: 'Avatar removed successfully',
                user: updatedUser
            });
        });
        this.updateName = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const userId = req.userId;
            const { name } = req.body;
            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    status: "error",
                    message: 'Name is required'
                });
            }
            if (name.trim().length > 50) {
                return res.status(400).json({
                    status: "error",
                    message: 'Name must be less than 50 characters'
                });
            }
            // Update user name in database
            const updatedUser = await user_1.User.findByIdAndUpdate(userId, { name: name.trim() }, { new: true }).select('-password');
            if (!updatedUser) {
                return res.status(404).json({
                    status: "error",
                    message: 'User not found'
                });
            }
            return res.status(200).json({
                status: "success",
                message: 'Name updated successfully',
                user: updatedUser
            });
        });
        this.updateAbout = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const userId = req.userId;
            const { about } = req.body;
            if (about && about.length > 139) {
                res.status(400).json({
                    status: "error",
                    message: 'Bio must be less than 140 characters'
                });
                return;
            }
            // Update user bio in database
            const updatedUser = await user_1.User.findByIdAndUpdate(userId, { about: about || '' }, { new: true }).select('-password');
            if (!updatedUser) {
                res.status(404).json({
                    status: "error",
                    message: 'User not found'
                });
                return;
            }
            res.status(200).json({
                status: "success",
                message: 'Bio updated successfully',
                user: updatedUser
            });
        });
        this.updateTheme = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const userId = req.userId;
            const { theme } = req.body;
            if (!theme || !["dark", "light", "system"].includes(theme)) {
                res.status(400).json({
                    status: "error",
                    message: 'Theme does not exist'
                });
            }
            // Update user bio in database
            const updatedUser = await user_1.User.findByIdAndUpdate(userId, { theme }, { new: true }).select('-password');
            if (!updatedUser) {
                res.status(404).json({
                    status: "error",
                    message: 'User not found'
                });
                return;
            }
            res.status(200).json({
                status: "success",
                message: 'Bio updated successfully',
                theme
            });
        });
    }
    generateToken(userId) {
        // @ts-ignore
        return jsonwebtoken_1.default.sign({ userId }, config_1.default.jwt.secret, { expiresIn: config_1.default.jwt.expiresIn });
    }
    setCookies(res, userId) {
        const token = this.generateToken(userId);
        res.cookie("authToken", token, {
            httpOnly: true,
            maxAge: config_1.default.jwt.maxAge,
            secure: true, // Required for cross-origin cookies
            sameSite: 'none', // Allows cross-origin cookies
        });
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, core_1.Post)('signin'),
    __metadata("design:type", Object)
], AuthController.prototype, "signin", void 0);
__decorate([
    (0, core_1.Post)('signup'),
    __metadata("design:type", Object)
], AuthController.prototype, "signup", void 0);
__decorate([
    (0, core_1.Get)('verify'),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], AuthController.prototype, "verify", void 0);
__decorate([
    (0, core_1.Post)('logout'),
    __metadata("design:type", Object)
], AuthController.prototype, "logout", void 0);
__decorate([
    (0, core_1.Put)('upload-avatar'),
    (0, core_1.Middleware)([verify_1.VerifyToken, multer_1.uploadAvatar.single('avatar')]),
    __metadata("design:type", Object)
], AuthController.prototype, "updateAvatar", void 0);
__decorate([
    (0, core_1.Delete)('delete-avatar'),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], AuthController.prototype, "deleteAvatar", void 0);
__decorate([
    (0, core_1.Put)('update-name'),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], AuthController.prototype, "updateName", void 0);
__decorate([
    (0, core_1.Put)('update-about'),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], AuthController.prototype, "updateAbout", void 0);
__decorate([
    (0, core_1.Put)('update-theme'),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], AuthController.prototype, "updateTheme", void 0);
exports.AuthController = AuthController = __decorate([
    (0, core_1.Controller)('api/auth')
], AuthController);
