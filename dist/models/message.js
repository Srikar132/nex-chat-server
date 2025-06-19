"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
// Updated Message Schema with additional fields for operations
const messageSchema = new mongoose_1.default.Schema({
    sender: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: function () {
            return !this.group;
        }
    },
    group: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Group',
        required: function () {
            return !this.recipient;
        }
    },
    content: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'image', 'document', 'link', 'reaction', "deleted", "video", "audio", "system"],
        default: 'text'
    },
    status: {
        type: String,
        enum: ['sent', 'delivered', 'read', 'failed', 'sending'],
        default: 'sent'
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    // Deletion tracking
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedBy: [{
            user: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                ref: 'User'
            },
            deletedAt: {
                type: Date,
                default: Date.now
            },
            deleteType: {
                type: String,
                enum: ['delete_for_me', 'delete_for_everyone'],
                default: 'delete_for_me'
            }
        }],
    deletedForEveryone: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
    // Forwarding tracking
    isForwarded: {
        type: Boolean,
        default: false
    },
    originalMessage: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Message'
    },
    forwardedFrom: {
        user: {
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: 'User'
        },
        chatType: {
            type: String,
            enum: ['user', 'group']
        },
    },
    forwardCount: {
        type: Number,
        default: 0
    },
    // Read receipts
    readBy: [{
            user: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                ref: 'User'
            },
            readAt: {
                type: Date,
                default: Date.now
            }
        }],
    // Edit tracking
    isEdited: {
        type: Boolean,
        default: false
    },
    editHistory: [{
            content: String,
            editedAt: {
                type: Date,
                default: Date.now
            }
        }],
    // Reactions
    reactions: [{
            emoji: String,
            users: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                ref: 'User'
            }
        }],
    // Reply/Thread support
    replyTo: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Message'
    },
    // Attachments
    attachments: [{
            fileName: String,
            fileSize: Number,
            fileType: String,
            fileUrl: String,
            thumbnailUrl: String
        }]
}, {
    timestamps: true
});
// Indexes for performance
messageSchema.index({ sender: 1, recipient: 1, timestamp: -1 });
messageSchema.index({ group: 1, timestamp: -1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ isDeleted: 1, deletedForEveryone: 1 });
messageSchema.index({ originalMessage: 1 });
const Message = mongoose_1.default.model('Message', messageSchema);
exports.default = Message;
