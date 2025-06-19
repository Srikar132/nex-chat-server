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
exports.ContactController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const async_handler_1 = require("@/utils/async-handler");
const user_1 = require("@/models/user");
const message_1 = __importDefault(require("@/models/message"));
const verify_1 = require("@/middlewares/verify");
const core_1 = require("@overnightjs/core");
let ContactController = class ContactController {
    constructor() {
        this.toggleArchiveContact = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId, contactType } = req.body;
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            if (!['User', 'Group'].includes(contactType)) {
                return res.status(400).json({
                    message: "Invalid contact type",
                    status: "error"
                });
            }
            const user = await user_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
            const existingIndex = user.archivedContacts.findIndex(contact => contact.contactId.toString() === contactId && contact.contactType === contactType);
            let isArchived = false;
            if (existingIndex > -1) {
                // Remove from archived
                user.archivedContacts.splice(existingIndex, 1);
                isArchived = false;
            }
            else {
                // Add to archived
                user.archivedContacts.push({ contactId, contactType });
                isArchived = true;
            }
            await user.save();
            return res.status(200).json({
                message: isArchived ? "Contact archived successfully" : "Contact unarchived successfully",
                status: "success",
                isArchived
            });
        });
        // Toggle Favourite Contact
        this.toggleFavouriteContact = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId, contactType } = req.body;
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            if (!['User', 'Group'].includes(contactType)) {
                return res.status(400).json({
                    message: "Invalid contact type",
                    status: "error"
                });
            }
            const user = await user_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
            const existingIndex = user.favouriteContacts.findIndex(contact => contact.contactId.toString() === contactId && contact.contactType === contactType);
            let isFavourite = false;
            if (existingIndex > -1) {
                // Remove from favourites
                user.favouriteContacts.splice(existingIndex, 1);
                isFavourite = false;
            }
            else {
                // Add to favourites
                user.favouriteContacts.push({ contactId, contactType });
                isFavourite = true;
            }
            await user.save();
            return res.status(200).json({
                message: isFavourite ? "Contact added to favourites" : "Contact removed from favourites",
                status: "success",
                isFavourite
            });
        });
        // Toggle Pin Contact
        this.togglePinContact = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId, contactType } = req.body;
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            if (!['User', 'Group'].includes(contactType)) {
                return res.status(400).json({
                    message: "Invalid contact type",
                    status: "error"
                });
            }
            const user = await user_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
            const existingIndex = user.pinnedContacts.findIndex(contact => contact.contactId.toString() === contactId && contact.contactType === contactType);
            let isPinned = false;
            if (existingIndex > -1) {
                // Remove from pinned
                user.pinnedContacts.splice(existingIndex, 1);
                isPinned = false;
            }
            else {
                // Add to pinned (limit to 3 pinned contacts)
                if (user.pinnedContacts.length >= 3) {
                    return res.status(400).json({
                        message: "You can only pin up to 3 contacts",
                        status: "error"
                    });
                }
                user.pinnedContacts.push({ contactId, contactType });
                isPinned = true;
            }
            await user.save();
            return res.status(200).json({
                message: isPinned ? "Contact pinned successfully" : "Contact unpinned successfully",
                status: "success",
                isPinned
            });
        });
        // Block/Unblock User
        this.toggleBlockUser = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId } = req.body;
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            if (userId === contactId) {
                return res.status(400).json({
                    message: "You cannot block yourself",
                    status: "error"
                });
            }
            const user = await user_1.User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
            const existingIndex = user.blockedUsers.findIndex(blockedUserId => blockedUserId.toString() === contactId);
            let isBlocked = false;
            if (existingIndex > -1) {
                // Unblock user
                user.blockedUsers.splice(existingIndex, 1);
                isBlocked = false;
            }
            else {
                // Block user
                user.blockedUsers.push(new mongoose_1.default.Types.ObjectId(contactId));
                isBlocked = true;
            }
            await user.save();
            return res.status(200).json({
                message: isBlocked ? "User blocked successfully" : "User unblocked successfully",
                status: "success",
                isBlocked
            });
        });
        // Mark Messages as Read
        this.markMessagesAsRead = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId, contactType } = req.body;
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            let updateQuery;
            if (contactType === 'User') {
                // For direct messages
                updateQuery = {
                    $or: [
                        { sender: contactId, recipient: userId },
                        { sender: userId, recipient: contactId }
                    ],
                    group: { $exists: false },
                    status: { $ne: 'read' },
                    sender: { $ne: userId } // Only mark messages not sent by current user as read
                };
            }
            else if (contactType === 'Group') {
                // For group messages
                updateQuery = {
                    group: contactId,
                    sender: { $ne: userId },
                    'readBy.user': { $ne: userId }
                };
            }
            else {
                return res.status(400).json({
                    message: "Invalid contact type",
                    status: "error"
                });
            }
            if (contactType === 'User') {
                // Update direct messages
                await message_1.default.updateMany(updateQuery, {
                    $set: { status: 'read' }
                });
            }
            else {
                // Update group messages - add to readBy array
                await message_1.default.updateMany(updateQuery, {
                    $addToSet: {
                        readBy: {
                            user: userId,
                            readAt: new Date()
                        }
                    }
                });
            }
            return res.status(200).json({
                message: "Messages marked as read successfully",
                status: "success"
            });
        });
        // Delete Chat
        this.deleteChat = (0, async_handler_1.asyncHandler)(async (req, res) => {
            const { userId } = req;
            const { contactId } = req.params;
            const { contactType, deleteType } = req.body; // deleteType: 'delete_for_me' | 'delete_for_everyone'
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(contactId)) {
                return res.status(400).json({
                    message: "Invalid user or contact ID",
                    status: "error"
                });
            }
            if (!['delete_for_me', 'delete_for_everyone'].includes(deleteType)) {
                return res.status(400).json({
                    message: "Invalid delete type",
                    status: "error"
                });
            }
            let messageQuery;
            if (contactType === 'User') {
                messageQuery = {
                    $or: [
                        { sender: userId, recipient: contactId },
                        { sender: contactId, recipient: userId }
                    ],
                    group: { $exists: false }
                };
            }
            else if (contactType === 'Group') {
                messageQuery = {
                    group: contactId
                };
            }
            else {
                return res.status(400).json({
                    message: "Invalid contact type",
                    status: "error"
                });
            }
            if (deleteType === 'delete_for_everyone') {
                // Only allow if user is sender of all messages or admin of group
                if (contactType === 'Group') {
                    // Check if user is group admin (you'll need to implement group admin check)
                    // For now, we'll not allow delete for everyone in groups
                    return res.status(403).json({
                        message: "Only group admins can delete messages for everyone",
                        status: "error"
                    });
                }
                // Delete for everyone - only sender's messages
                await message_1.default.updateMany({ ...messageQuery, sender: userId }, {
                    $set: {
                        deletedForEveryone: true,
                        deletedAt: new Date(),
                        content: "This message was deleted",
                        messageType: "deleted",
                        isDeleted: true
                    }
                });
            }
            else {
                // Delete for me
                await message_1.default.updateMany(messageQuery, {
                    $addToSet: {
                        deletedBy: {
                            user: userId,
                            deletedAt: new Date(),
                            deleteType: 'delete_for_me'
                        }
                    }
                });
            }
            // Remove from user's archived, favourites, and pinned lists
            await user_1.User.findByIdAndUpdate(userId, {
                $pull: {
                    archivedContacts: { contactId, contactType },
                    favouriteContacts: { contactId, contactType },
                    pinnedContacts: { contactId, contactType }
                }
            });
            return res.status(200).json({
                message: deleteType === 'delete_for_everyone'
                    ? "Chat deleted for everyone"
                    : "Chat deleted for you",
                status: "success"
            });
        });
    }
};
exports.ContactController = ContactController;
__decorate([
    (0, core_1.Post)("archive"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "toggleArchiveContact", void 0);
__decorate([
    (0, core_1.Post)("favourite"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "toggleFavouriteContact", void 0);
__decorate([
    (0, core_1.Post)("pin"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "togglePinContact", void 0);
__decorate([
    (0, core_1.Post)("contact/block"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "toggleBlockUser", void 0);
__decorate([
    (0, core_1.Post)("messages/mark-as-read"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "markMessagesAsRead", void 0);
__decorate([
    (0, core_1.Delete)("delete-chat/:contactId"),
    (0, core_1.Middleware)([verify_1.VerifyToken]),
    __metadata("design:type", Object)
], ContactController.prototype, "deleteChat", void 0);
exports.ContactController = ContactController = __decorate([
    (0, core_1.Controller)('api/contacts')
], ContactController);
