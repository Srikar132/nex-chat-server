import {NextFunction, Request, Response} from "express";
import { Document, Types } from 'mongoose';
import {Socket} from "socket.io";

export type AsyncFunction = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<any>;

export type AsyncFunctionVoid = (
    req: Request,
    res: Response,
    next: NextFunction
) => void;

interface SocketUser extends Socket {
    user: {
        _id: string;
        username: string;
    };
}


export interface IUser extends Document {
    email: string;
    password: string;
    name: string;
    avatar?: string;
    about?: string;
    statusMessage?: string;
    hasStory? : boolean;
    isVerified: boolean;
    isProfileSetUp: boolean;
    darkmode: boolean;
    verificationCode?: string;
    verificationCodeExpiresAt?: Date;
    blockedUsers: Types.ObjectId[];
    pinnedContacts: {
        contactId: Types.ObjectId;
        contactType: 'User' | 'Group';
    }[];
    favouriteContacts: {
        contactId: Types.ObjectId;
        contactType: 'User' | 'Group';
    }[],
    archivedContacts: {
        contactId: Types.ObjectId;
        contactType: 'User' | 'Group';
    }[],
    lastSeen?: Date;
}


export interface IMessage extends Document {
    sender: Types.ObjectId;
    recipient?: Types.ObjectId;
    group?: Types.ObjectId;
    content: string;
    messageType: 'text' | 'image' | 'document' | 'link' | 'reaction' | "deleted" | "video" | "audio" | "system" ;
    status: 'sent' | 'delivered' | 'read' | 'failed' | 'sending';
    timestamp: Date;

    isDeleted: boolean;
    deletedBy: {
        user: Types.ObjectId;
        deletedAt: Date;
        deleteType: 'delete_for_me' | 'delete_for_everyone';
    }[];
    deletedForEveryone: boolean;
    deletedAt?: Date;

    isForwarded: boolean;
    originalMessage?: Types.ObjectId;
    forwardedFrom?: {
        user: Types.ObjectId;
        chatType: 'user' | 'group';
    };
    forwardCount: number;

    readBy: {
        user: Types.ObjectId;
        readAt: Date;
    }[];

    isEdited: boolean;
    editHistory: {
        content: string;
        editedAt: Date;
    }[];

    reactions: {
        emoji: string;
        user: Types.ObjectId;
    }[];

    replyTo?: Types.ObjectId;

    attachments: {
        fileName: string;
        fileSize: number;
        fileType: string;
        fileUrl: string;
        thumbnailUrl: string;
    }[];
}


export interface IGroup extends Document {
    name: string;
    description?: string;
    avatar?: string | null;
    members: {
        user: Types.ObjectId;
        role: 'admin' | 'member';
        joinedAt: Date;
    }[];
    createdBy: Types.ObjectId
    settings: {
        allowMemberInvites: boolean,
        onlyAdminsCanPost: boolean
    }
}


