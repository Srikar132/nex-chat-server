import mongoose, {Schema} from 'mongoose';
import {IGroup} from "@/types";
const groupSchema  : Schema<IGroup> = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    avatar: {
        type: String,
        default: null
    },
    members: [{
        user : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['admin', 'member'],
            default: 'member'
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    settings: {
        allowMemberInvites: {
            type: Boolean,
            default: true
        },
        onlyAdminsCanPost: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});


const Group = mongoose.model<IGroup>('Group', groupSchema);

export default Group;