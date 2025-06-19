import {Controller, Get, Middleware, Post} from "@overnightjs/core";
import {VerifyToken} from "@/middlewares/verify";
import {asyncHandler} from "@/utils/async-handler";
import {Request, Response} from "express";
import mongoose from "mongoose";
import {User} from "@/models/user";
import Message from "@/models/message";
import Group from "@/models/group";
import  { IMessage } from "@/types";
import {uploadAvatar} from "@/utils/multer";


@Controller('api/user')
export class UserController {

    @Get("contacts")
    @Middleware([VerifyToken])
    public getContacts = asyncHandler(
        async (req : Request, res : Response) => {
            let {userId} = req;
    
            if(!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({
                    message: "Invalid user id",
                    status: "error"
                });
            }
            // @ts-ignore
            userId  = new mongoose.Types.ObjectId(userId);
    
            const user = await User.findById(userId).select("pinnedContacts blockedUsers favouriteContacts archivedContacts");
            if(!user) {
                return res.status(404).json({
                    message: "User not found",
                    status: "error"
                });
            }
    
            const blockedUsers = user.blockedUsers
                ?.map(id => id.toString());
    
            const pinnedUserIds = user.pinnedContacts
            ?.filter(contact => contact.contactType === 'User')
            .map(contact => contact.contactId.toString()) || [];
    
            const pinnedGroupIds = user.pinnedContacts
            ?.filter(contact => contact.contactType === 'Group')
            .map(contact => contact.contactId.toString()) || [];
    
            // Extract favourite contact IDs for both users and groups
            const favouriteUserIds = user.favouriteContacts
                ?.filter(contact => contact.contactType === 'User')
                .map(contact => contact.contactId.toString()) || [];
    
            const favouriteGroupIds = user.favouriteContacts
                ?.filter(contact => contact.contactType === 'Group')
                .map(contact => contact.contactId.toString()) || [];
    
            // Extract archived contact IDs for both users and groups
            const archivedUserIds = user.archivedContacts
                ?.filter(contact => contact.contactType === 'User')
                .map(contact => contact.contactId.toString()) || [];
    
            const archivedGroupIds = user.archivedContacts
                ?.filter(contact => contact.contactType === 'Group')
                .map(contact => contact.contactId.toString()) || [];
    
            const directMessages = await Message.aggregate([
                {
                    $match: {
                        $or: [{ sender: userId }, { recipient: userId }],
                        group: { $exists: false },
                        messageType: {$ne : "system"}
                    },
                },
                { $sort: { timestamp: -1 } },
                {
                    $group: {
                        _id: {
                            $cond: {
                                if: { $eq: ["$sender", userId] },
                                then: "$recipient",
                                else: "$sender",
                            },
                        },
                        lastMessageTime: { $first: "$timestamp" },
                        lastMessageContent: { $first: "$content" },
                        lastMessageType: { $first: "$messageType" },
                        lastMessageStatus: { $first: "$status" },
                        lastMessageSender: { $first: "$sender" },
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "contactInfo",
                    },
                },
                { $unwind: "$contactInfo" },
                {
                    $lookup: {
                        from: "messages",
                        let: { contactId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$sender", "$$contactId"] },
                                            { $eq: ["$recipient", userId] },
                                            { $ne: ["$status", "read"] },
                                        ],
                                    },
                                },
                            },
                            { $count: "unreadCount" },
                        ],
                        as: "unreadMessages",
                    },
                },
                // Lookup for common groups
                {
                    $lookup: {
                        from: "groups",
                        let: { contactId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: [userId, "$members.user"] },
                                            { $in: ["$$contactId", "$members.user"] }
                                        ]
                                    }
                                }
                            },
                            {
                                $lookup: {
                                    from: "users",
                                    localField: "members.user",
                                    foreignField: "_id",
                                    as: "memberDetails"
                                }
                            },
                            {
                                $project: {
                                    avatar: 1,
                                    name: 1,
                                    members: {
                                        $map: {
                                            input: "$memberDetails",
                                            as: "member",
                                            in: "$$member.name"
                                        }
                                    }
                                }
                            }
                        ],
                        as: "commonGroups",
                    },
                },
                {
                    $project: {
                        _id: 1,
                        name: "$contactInfo.name",
                        about: "$contactInfo.about",
                        email: "$contactInfo.email",
                        message: "$lastMessageContent",
                        timestamp: "$lastMessageTime",
                        avatar: "$contactInfo.avatar",
                        unreadCount: {
                            $ifNull: [{ $arrayElemAt: ["$unreadMessages.unreadCount", 0] }, 0],
                        },
                        isPinned: {
                            $in: [{ $toString: "$_id" }, pinnedUserIds],
                        },
                        isFavourite: {
                            $in: [{ $toString: "$_id" }, favouriteUserIds],
                        },
                        isArchived: {
                            $in: [{ $toString: "$_id" }, archivedUserIds],
                        },
                        isBlocked : {
                          $in : [{$toString : "$_id" } , blockedUsers],
                        },
                        hasStory: "$contactInfo.hasStory",
                        messageStatus: {
                            $cond: {
                                if: { $eq: ["$lastMessageSender", userId] },
                                then: "$lastMessageStatus",
                                else: null,
                            },
                        },
                        messageType: "$lastMessageType",
                        isGroup: { $literal: false },
                        groupMembers: { $literal: null },
                        lastSeen: "$contactInfo.lastSeen",
                        isAdmin: { $literal: null },
                        commonGroups: "$commonGroups",
                        settings: { $literal: null }
                    },
                },
            ]);
    
            const groups = await Group.aggregate([
                { $match: { "members.user": userId } },
                {
                    $lookup: {
                        from: "messages",
                        let: { groupId: "$_id" },
                        pipeline: [
                            { $match: { $expr: { $eq: ["$group", "$$groupId"] } } },
                            { $sort: { timestamp: -1 } },
                            { $limit: 1 },
                        ],
                        as: "lastMessage",
                    },
                },
                {
                    $unwind: {
                        path: "$lastMessage",
                        preserveNullAndEmptyArrays: true,
                    },
                },
                {
                    $lookup: {
                        from: "messages",
                        let: { groupId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$group", "$$groupId"] },
                                            { $ne: ["$sender", userId] },
                                            {
                                                $not: {
                                                    $in: [userId, "$readBy.user"],
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            { $count: "unreadCount" },
                        ],
                        as: "unreadMessages",
                    },
                },
                {
                    $lookup: {
                        from: "users",
                        localField: "members.user",
                        foreignField: "_id",
                        as: "memberDetails",
                    },
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        about: { $literal: null },
                        email: { $literal: null },
                        message: "$lastMessage.content",
                        timestamp: "$lastMessage.timestamp",
                        avatar: "$avatar",
                        unreadCount: {
                            $ifNull: [{ $arrayElemAt: ["$unreadMessages.unreadCount", 0] }, 0],
                        },
                        isPinned: {
                            $in: [{ $toString: "$_id" }, pinnedGroupIds],
                        },
                        isFavourite: {
                            $in: [{ $toString: "$_id" }, favouriteGroupIds],
                        },
                        isArchived: {
                            $in: [{ $toString: "$_id" }, archivedGroupIds],
                        },
                        isBlocked: { $literal: false },
                        hasStory: { $literal: false },
                        messageStatus: {
                            $cond: {
                                if: { $eq: ["$lastMessage.sender", userId] },
                                then: "$lastMessage.status",
                                else: null,
                            },
                        },
                        messageType: "$lastMessage.messageType",
                        isGroup: { $literal: true },
                        groupMembers: {
                            $map: {
                                input: "$members",
                                as: "member",
                                in: {
                                    user: {
                                        name: {
                                            $let: {
                                                vars: {
                                                    memberDetail: {
                                                        $arrayElemAt: [
                                                            {
                                                                $filter: {
                                                                    input: "$memberDetails",
                                                                    cond: { $eq: ["$$this._id", "$$member.user"] }
                                                                }
                                                            },
                                                            0
                                                        ]
                                                    }
                                                },
                                                in: "$$memberDetail.name"
                                            }
                                        },
                                        _id: { $toString: "$$member.user" }
                                    },
                                    role: "$$member.role",
                                    joinedAt: { $dateToString: { date: "$$member.joinedAt", format: "%Y-%m-%dT%H:%M:%S.%LZ" } }
                                }
                            }
                        },
                        lastSeen: { $literal: null },
                        isAdmin: {
                            $in: [
                                "admin",
                                {
                                    $map: {
                                        input: {
                                            $filter: {
                                                input: "$members",
                                                cond: { $eq: ["$$this.user", userId] }
                                            }
                                        },
                                        as: "userMember",
                                        in: "$$userMember.role"
                                    }
                                }
                            ]
                        },
                        commonGroups: { $literal: null },
                        settings: "$settings"
                    },
                },
            ]);

            // console.log(groups);
    
            const combinedContacts = [...directMessages, ...groups].sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
    
            const formattedContacts = combinedContacts.map((contact) => ({
                ...contact,
                timestamp: contact.timestamp
                    ? new Date(contact.timestamp).toISOString()
                    : null,
                lastSeen: contact.lastSeen
                    ? new Date(contact.lastSeen).toISOString()
                    : null,
                message: contact.message || "",
                unreadCount: contact.unreadCount || 0,
                isPinned: contact.isPinned || false,
                isFavourite: contact.isFavourite || false,
                isArchived: contact.isArchived || false,
                isBlocked: contact.isBlocked || false,
                hasStory: contact.hasStory || false,
            }));
    
            return res.status(200).json(formattedContacts);
        }
    )


    @Get('users')
    @Middleware([VerifyToken])
    public getAllUsers = asyncHandler(
        async (req : Request, res : Response) => {
            const result = await User.find({ _id: { $ne: req.userId } });
            return res.status(200).json(result);
        }
    );


    @Get('messages')
    @Middleware([VerifyToken])
    public getMessages = asyncHandler(
        async (req: Request, res: Response) => {
            const { chatType, page = 1, limit = 50 } = req.query;
            let { userId } = req;
            let { chatId } = req.query;
    
            // Validate and convert to ObjectId
            if (!userId || !chatId) {
                return res.status(400).json({ error: 'userId and chatId are required' });
            }
    
            try {
                // @ts-ignore
                userId = new mongoose.Types.ObjectId(userId as string);
                // @ts-ignore
                chatId = new mongoose.Types.ObjectId(chatId as string);
            } catch (error) {
                return res.status(400).json({ error: 'Invalid userId or chatId format' });
            }
    
            const pageNum = Math.max(1, parseInt(page as string));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit as string))); // Cap at 100
            const skip = (pageNum - 1) * limitNum;
    
            let matchCondition = {};
    
            if (chatType === 'user') {
                matchCondition = {
                    $and: [
                      {
                        $or: [
                          { sender: userId, recipient: chatId },
                          { sender: chatId, recipient: userId }
                        ]
                      },
                      { group: { $exists: false } },
                      // Exclude system messages from user chats
                      { messageType: { $ne: 'system' } }
                    ]
                  };
            } else if (chatType === 'group') {
                matchCondition = { 
                    group: chatId,
                    // System messages are allowed in group chats
                };
            } else {
                return res.status(400).json({ error: 'Invalid chatType. Must be "user" or "group"' });
            }
    
            try {
                const messages = await Message.aggregate([
                    { $match: matchCondition },
    
                    // Enhanced deletion logic
                    {
                        $addFields: {
                            isDeletedForUser: {
                                $or: [
                                    { $eq: ["$deletedForEveryone", true] },
                                    { $eq: ["$isDeleted", true] },
                                    {
                                        $in: [userId, { $ifNull: ["$deletedBy.user", []] }]
                                    }
                                ]
                            },
                            deletedForEveryone: { $ifNull: ["$deletedForEveryone", false] }
                        }
                    },
    
                    // Transform deleted messages
                    {
                        $addFields: {
                            content: {
                                $cond: {
                                    if: "$isDeletedForUser",
                                    then: {
                                        $cond: {
                                            if: "$deletedForEveryone",
                                            then: "This message was deleted",
                                            else: "You deleted this message"
                                        }
                                    },
                                    else: "$content"
                                }
                            },
                            messageType: {
                                $cond: {
                                    if: "$isDeletedForUser",
                                    then: "deleted",
                                    else: { $ifNull: ["$messageType", "text"] }
                                }
                            },
                            // Preserve original fields for client-side handling
                            originalContent: "$content",
                            originalMessageType: "$messageType"
                        }
                    },
    
                    { $sort: { timestamp: -1 } },
                    { $skip: skip },
                    { $limit: limitNum },
    
                    // Enhanced lookups with better error handling
                    {
                        $lookup: {
                            from: "users",
                            localField: "sender",
                            foreignField: "_id",
                            as: "senderInfo",
                            pipeline: [
                                {
                                    $project: {
                                        _id: 1,
                                        name: 1,
                                        username: 1,
                                        avatar: 1,
                                        isOnline: 1,
                                        lastSeen: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "recipient",
                            foreignField: "_id",
                            as: "recipientInfo",
                            pipeline: [
                                {
                                    $project: {
                                        _id: 1,
                                        name: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "messages",
                            localField: "replyTo",
                            foreignField: "_id",
                            as: "replyToInfo",
                            pipeline: [
                                {
                                    $lookup: {
                                        from: "users",
                                        localField: "sender",
                                        foreignField: "_id",
                                        as: "replyToSender"
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        content: 1,
                                        messageType: 1,
                                        timestamp: 1,
                                        sender: { $arrayElemAt: ["$replyToSender", 0] },
                                        attachments: { $slice: ["$attachments", 1] } // Only first attachment for preview
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $lookup: {
                            from: "messages",
                            localField: "originalMessage",
                            foreignField: "_id",
                            as: "originalMessageInfo"
                        }
                    },
    
                    // Enhanced projection
                    {
                        $project: {
                            _id: 1,
                            content: 1,
                            messageType: 1,
                            timestamp: 1,
                            status: { $ifNull: ["$status", "sent"] },
                            isForwarded: { $ifNull: ["$isForwarded", false] },
                            isEdited: { $ifNull: ["$isEdited", false] },
                            isDeletedForUser: 1,
                            deletedForEveryone: 1,
                            isDeleted: { $ifNull: ["$isDeleted", false] },
                            editedAt: 1,
                            editHistory: { $ifNull: ["$editHistory", []] },
                            forwardCount: { $ifNull: ["$forwardCount", 0] },
    
                            // Sender information
                            sender: {
                                $ifNull: [
                                    { $arrayElemAt: ["$senderInfo", 0] },
                                    {
                                        _id: "$sender",
                                        name: "Unknown User",
                                        username: "unknown",
                                        avatar: null
                                    }
                                ]
                            },
    
                            // Recipient information (for direct messages)
                            recipient: {
                                $cond: {
                                    if: { $eq: [{ $type: "$recipient" }, "objectId"] },
                                    then: { $arrayElemAt: ["$recipientInfo", 0] },
                                    else: null
                                }
                            },
    
                            // Reply information
                            replyTo: { $arrayElemAt: ["$replyToInfo", 0] },
    
                            // Forward information
                            originalMessage: { $arrayElemAt: ["$originalMessageInfo", 0] },
                            forwardedFrom: 1,
    
                            // Attachments with enhanced metadata
                            attachments: {
                                $map: {
                                    input: { $ifNull: ["$attachments", []] },
                                    as: "attachment",
                                    in: {
                                        _id: "$attachment._id",
                                        fileName: "$attachment.fileName",
                                        fileUrl: "$attachment.fileUrl",
                                        fileType: "$attachment.fileType",
                                        fileSize: "$attachment.fileSize",
                                        mimeType: "$attachment.mimeType",
                                        thumbnailUrl: "$attachment.thumbnailUrl"
                                    }
                                }
                            },
    
                            // Read receipts with user info
                            readBy: {
                                $map: {
                                    input: { $ifNull: ["$readBy", []] },
                                    as: "read",
                                    in: {
                                        user: {
                                            _id: "$read.user",
                                            // You might want to lookup user details here too
                                        },
                                        readAt: "$read.readAt"
                                    }
                                }
                            },
    
                            // Group information (if applicable)
                            group: 1,
    
                            // Reaction information
                            reactions: { $ifNull: ["$reactions", []] },
    
                            // Metadata
                            createdAt: "$timestamp",
                            updatedAt: 1
                        }
                    }
                ]);
    
                // Check if there are more messages
                const hasMore = messages.length === limitNum;
    
                // Get a total unread count for this chat (excluding system messages for user chats)
                let unreadCount = 0;
                if (chatType === 'user') {
                    unreadCount = await Message.countDocuments({
                        sender: chatId,
                        recipient: userId,
                        messageType: { $ne: 'system' }, // Exclude system messages from unread count
                        'readBy.user': { $ne: userId }
                    });
                } else if (chatType === 'group') {
                    unreadCount = await Message.countDocuments({
                        group: chatId,
                        sender: { $ne: userId },
                        'readBy.user': { $ne: userId }
                    });
                }
                
                // @ts-ignore
                const unreadMessages = messages.filter(message => {
                    if (message.sender.toString() === userId?.toString()) return false;
                    
                    // Skip system messages for unread count in user chats
                    if (chatType === 'user' && message.messageType === 'system') return false;
    
                    const hasRead = (message.readBy as IMessage["readBy"])?.some(read =>
                        read.user.toString() === userId?.toString()
                    );
    
                    return !hasRead;
                });
    
                const unreadMessageIds = unreadMessages.map(msg => msg._id.toString())
    
                return res.status(200).json({
                    success: true,
                    messages: messages, // Reverse to get chronological order
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        hasMore,
                        total: messages.length
                    },
                    metadata: {
                        unreadCount,
                        unreadMessageIds,
                        chatType,
                        chatId: chatId?.toString()
                    }
                });
    
            } catch (aggregationError) {
                console.error('Message aggregation error:', aggregationError);
                return res.status(500).json({
                    error: 'Failed to fetch messages',
                    details: process.env.NODE_ENV === 'development' ? (aggregationError as any)?.message : undefined
                });
            }
        }
    );


    @Post('group')
    @Middleware([VerifyToken,uploadAvatar.single("avatar")])
    public creategroup = asyncHandler(
        async (req : Request , res : Response) => {
            const {userId} = req;
    
            if(!userId) {
                return res.status(401).json({
                    status : "error",
                    message : "Not authorized"
                })
            }
    
            const file = req.file;

    
            let avatarUrl = '';
            if(file) {
                // Generate avatar URL
                avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${file.filename}`;
            }
    
            const {name, description, members, allowMemberInvites, onlyAdminsCanPost} = req.body;

            const _members = members.split(',')
    
            // Validate required fields
            if(!name || !name.trim()) {
                return res.status(400).json({
                    status: "error",
                    message: "Group name is required"
                });
            }
    
            const group = new Group({
                name: name.trim(),
                description: description?.trim() || '',
                avatar: avatarUrl, // Fixed: should be 'avatar' not 'avatarUrl'
                settings: {
                    allowMemberInvites: allowMemberInvites !== undefined ? allowMemberInvites : true,
                    onlyAdminsCanPost: onlyAdminsCanPost !== undefined ? onlyAdminsCanPost : false
                },
                createdBy: userId
            });
    
            // Add creator as admin
            group.members.push({
                user: new mongoose.Types.ObjectId(userId),
                role: "admin",
                joinedAt: new Date(),
            });

    
            // Add members if provided
            if(_members && Array.isArray(_members) && _members.length > 0) {
                _members.forEach((member: string) => {
                    if(mongoose.Types.ObjectId.isValid(member) && member !== userId.toString()) {
                        group.members.push({
                            user: new mongoose.Types.ObjectId(member),
                            role: "member",
                            joinedAt: new Date(),
                        });
                    }
                });
            }
    
            await group.save();
    
            const populatedGroup = await Group.findById(group._id).populate("members.user", "id name avatar email");
    
            return res.status(200).json({
                status: "success",
                message: "Group created successfully",
                group: populatedGroup
            });
        }
    )

}