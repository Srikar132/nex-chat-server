"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const UserSchema = new mongoose_1.default.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: String,
    name: {
        type: String,
        required: true
    },
    avatar: String,
    about: String,
    statusMessage: {
        type: String,
        default: "Hey there! I'm using ChatApp."
    },
    hasStory: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isProfileSetUp: { type: Boolean, default: false },
    darkmode: { type: Boolean, default: false },
    verificationCode: String,
    verificationCodeExpiresAt: Date,
    blockedUsers: [{
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: "User"
        }],
    pinnedContacts: [{
            contactId: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                required: true,
                refPath: 'pinnedContacts.contactType'
            },
            contactType: {
                type: String,
                required: true,
                enum: ['User', 'Group']
            }
        }],
    favouriteContacts: [{
            contactId: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                required: true,
                refPath: 'favouriteContacts.contactType'
            },
            contactType: {
                type: String,
                required: true,
                enum: ['User', 'Group']
            }
        }],
    archivedContacts: [{
            contactId: {
                type: mongoose_1.default.Schema.Types.ObjectId,
                required: true,
                refPath: 'archivedContacts.contactType'
            },
            contactType: {
                type: String,
                required: true,
                enum: ['User', 'Group']
            }
        }],
    lastSeen: Date,
}, {
    timestamps: true
});
exports.User = mongoose_1.default.model("User", UserSchema);
