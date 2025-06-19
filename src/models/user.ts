import mongoose, {Schema} from "mongoose";
import {IUser} from "@/types";

const UserSchema : Schema<IUser> = new mongoose.Schema({
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
    hasStory : { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    isProfileSetUp: { type: Boolean, default: false },
    darkmode: { type: Boolean, default: false },

    verificationCode: String,
    verificationCodeExpiresAt: Date,

    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],

    pinnedContacts: [{
        contactId: {
            type: mongoose.Schema.Types.ObjectId,
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
            type: mongoose.Schema.Types.ObjectId,
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
            type: mongoose.Schema.Types.ObjectId,
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

} , {
    timestamps : true
});

export const User = mongoose.model<IUser>("User", UserSchema);
