import { Server  } from "socket.io";
import {IMessage, SocketUser} from "@/types";
import Message from "@/models/message";
import Group from "@/models/group";
import {User} from "@/models/user";
import {generateThumbnail, uploadFileToCloud} from "@/utils/file-upload";
import mongoose from "mongoose";

interface FileUploadSession {
    uploadId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    totalChunks: number;
    receivedChunks: Buffer[];
    chatId: string;
    chatType: string;
    userId: string;
}

interface ReactionPayload {
    recipient?: string;
    group?: string;
    messageData: {
        reaction: string;
        reactionTo: string;
    };
}

interface MessageData {
    content?: string;
    messageType?: 'text' | 'image' | 'document' | 'link' | 'reaction' | "system";
    attachments?: Array<{
        fileName: string;
        fileSize: number;
        fileType: string;
        fileUrl: string;
        thumbnailUrl?: string;
    }>;
    replyTo?: string;
    isForwarded?: boolean;
    originalMessage?: string;
    forwardedFrom?: {
        user: string;
        chatType: 'user' | 'group';
    };
    status : "sending"
}

interface JoinChatData {
    chatId: string;
    chatType: 'user' | 'group';
}

interface SendMessageData {
    recipient?: string;
    group?: string;
    messageData: MessageData;
}

interface DeleteMultipleMessagesData {
    chatId: string;
    chatType: "user" | "group";
    messageIds: string[];
    deleteType: 'delete_for_me' | 'delete_for_everyone';
}

interface EditMessageData {
    chatId: string;
    chatType: "user" | "group";
    messageId: string;
    newContent: string;
}

interface ForwardMultipleMessageData {
    originalMessageIds: string[];
    targetChatIds: string[];
    targetChatType: 'user' | 'group';
}

interface MarkReadData {
    chatId: string;
    chatType: "user" | "group";
    messageIds: string[];
}

interface TypingData {
    chatId: string;
    chatType: "user" | "group";
}

interface FileUploadStartData {
    uploadId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    totalChunks: number;
    chatId: string;
    chatType: string;
}

interface FileUploadChunkData {
    uploadId: string;
    chunkIndex: number;
    chunk: number[];
}

// File upload sessions storage
const fileUploadSessions = new Map<string, FileUploadSession>();

// Active users and typing status
const activeUsers = new Map<string, SocketUser>();
const typingUsers = new Map<string, Set<string>>();

export class ChatHandlers {
    private io: Server;

    constructor(io: Server) {
        this.io = io;
    }

    public initializeHandlers(socket: SocketUser): void {
        // Store user connection
        if (socket.user) {
            activeUsers.set(socket.user._id, socket);
            socket.broadcast.emit('user-online', {
                userId : socket.user._id,
            });
            socket.emit("get-online-list" , {
                list : [...activeUsers.keys()]
            });
        }

        // Chat room management (keeping for compatibility but not using rooms)
        socket.on('join-chat', (data: JoinChatData) => this.handleJoinChat(socket, data));
        socket.on('leave-chat', (data: JoinChatData) => this.handleLeaveChat(socket, data));

        // Message handling
        socket.on('send-message', (data: SendMessageData) => this.handleSendMessage(socket, data));
        socket.on('edit-message', (data: EditMessageData) => this.handleEditMessage(socket, data));
        socket.on('delete-messages', (data: DeleteMultipleMessagesData) => this.handleDeleteMessages(socket, data));
        socket.on('forward-messages', (data: ForwardMultipleMessageData) => this.handleForwardMessages(socket, data));
        socket.on('mark-messages-read', (data: MarkReadData) => this.handleMarkMessagesRead(socket, data));

        // Typing indicators
        socket.on('typing-start', (data: TypingData) => this.handleTypingStart(socket, data));
        socket.on('typing-stop', (data: TypingData) => this.handleTypingStop(socket, data));

        socket.on("message:react", (payload: ReactionPayload) => this.handleReactToMessage(socket, payload));

        // File upload handling
        socket.on('file-upload-start', (data: FileUploadStartData) => this.handleFileUploadStart(socket, data));
        socket.on('file-upload-chunk', (data: FileUploadChunkData) => this.handleFileUploadChunk(socket, data));

        // Disconnect handling
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    private handleJoinChat(socket: SocketUser, data: JoinChatData): void {
        // Keeping for compatibility but not using rooms
        console.log(`User ${socket.user?._id} joined chat ${data.chatId}`);
    }

    private handleLeaveChat(socket: SocketUser, data: JoinChatData): void {
        // Stop typing if user was typing
        this.handleTypingStop(socket, data);
        console.log(`User ${socket.user?._id} left chat ${data.chatId}`);
    }

    // Helper method to send message to all relevant user sockets
    private sendToUserSockets(userIds: string[], event: string, data: any): void {
        userIds.forEach(userId => {
            const userSockets = Array.from(this.io.sockets.sockets.values())
                .filter(s => (s as SocketUser).user?._id === userId);

            userSockets.forEach(userSocket => {
                userSocket.emit(event, data);
            });
        });
    }

    private async handleSendMessage(socket: SocketUser, data: SendMessageData): Promise<void> {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }

            // Validate message data
            if (!data.messageData.content?.trim() && !data.messageData.attachments?.length) {
                socket.emit('error', { message: 'Message content or attachments required' });
                return;
            }

            // Determine chat type and validate
            let chatId: string;
            let chatType: 'user' | 'group';
            let targetUserIds: string[] = [];

            if (data.recipient) {
                // Direct message
                const recipient = await User.findById(data.recipient);
                if (!recipient) {
                    socket.emit('error', { message: 'Recipient not found' });
                    return;
                }
                chatId = data.recipient;
                chatType = 'user';
                targetUserIds = [data.recipient, socket.user._id]; // Both sender and recipient
            } else if (data.group) {
                // Group message
                const group = await Group.findById(data.group)
                if (!group) {
                    socket.emit('error', { message: 'Group not found' });
                    return;
                }

                // Check if user is member of group
                const isMember = group.members.some(member =>
                    member.user.toString() === socket.user!._id
                );
                if (!isMember) {
                    socket.emit('error', { message: 'Not a member of this group' });
                    return;
                }

                chatId = data.group;
                chatType = 'group';
                targetUserIds = group.members.map(member => member.user.toString()); // All group members
            } else {
                socket.emit('error', { message: 'Invalid chat data' });
                return;
            }

            // Validate reply message if replying
            if (data.messageData.replyTo) {
                const replyMessage = await Message.findById(data.messageData.replyTo);
                if (!replyMessage) {
                    socket.emit('error', { message: 'Reply message not found' });
                    return;
                }
            }

            // Handle forwarded message
            if (data.messageData.isForwarded && data.messageData.originalMessage) {
                const originalMessage = await Message.findById(data.messageData.originalMessage);
                if (originalMessage) {
                    // Increment forward count
                    await Message.findByIdAndUpdate(
                        data.messageData.originalMessage,
                        { $inc: { forwardCount: 1 } }
                    );
                }
            }

            // Create message
            const messageDoc = new Message({
                sender: socket.user._id,
                ...(data.recipient ? { recipient: data.recipient } : { group: data.group }),
                content: data.messageData.content || '',
                messageType: data.messageData.messageType || 'text',
                attachments: data.messageData.attachments || [],
                replyTo: data.messageData.replyTo,
                isForwarded: data.messageData.isForwarded || false,
                originalMessage: data.messageData.originalMessage,
                forwardedFrom: data.messageData.forwardedFrom,
                timestamp: new Date(),
                status: 'sent'
            });

            const savedMessage = await messageDoc.save();

            // Populate sender information
            await savedMessage.populate('sender', 'id username avatar');
            if (savedMessage.replyTo) {
                await savedMessage.populate('replyTo', 'id content sender messageType');
            }

            // Send message to all target users
            this.sendToUserSockets(targetUserIds, 'new-message', {
                chatId,
                chatType,
                message: savedMessage
            });

            // Send delivery confirmation to sender
            socket.emit('message-delivered', {
                messageId: savedMessage._id,
                deliveredAt: new Date().toISOString()
            });

            // Update message status to delivered
            await Message.findByIdAndUpdate(savedMessage._id, {
                status: 'delivered'
            });

            // Stop typing for sender
            this.handleTypingStop(socket, { chatId, chatType });

        } catch (error) {
            // console.error('Send message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }

    private async handleReactToMessage(socket : SocketUser , payload: ReactionPayload) {
        try {
            const { recipient, group, messageData } = payload;
            const senderId = socket.user._id as string;

            if (!senderId || !messageData?.reactionTo || !messageData?.reaction) {
                return socket.emit("error", { message: "Invalid reaction payload" });
            }

            const originalMessage = await Message.findById(messageData.reactionTo);
            if (!originalMessage) {
                return socket.emit("error", { message: "Original message not found" });
            }

            // Remove existing reaction by the user (if any)
            originalMessage.reactions = originalMessage.reactions.filter(
                (r) => !r.user.equals(senderId)
            );

            // Add new reaction
            originalMessage.reactions.push({
                emoji: messageData.reaction,
                user: new mongoose.Types.ObjectId(senderId),
            });

            await originalMessage.save();

            // Determine target users
            let targetUserIds: string[] = [];
            if (recipient) {
                targetUserIds = [recipient, senderId];
            } else if (group) {
                const groupDoc = await Group.findById(group)
                if (groupDoc) {
                    targetUserIds = groupDoc.members.map(member => member.user.toString());
                }
            }

            // Send updated reaction to all target users
            this.sendToUserSockets(targetUserIds, "message:reaction:updated", {
                messageId: originalMessage._id,
                reactions: originalMessage.reactions,
            });

        } catch (err) {
            // console.error("Error in message:react:", err);
            socket.emit("error", { message: "Failed to react to message" });
        }
    }

    private async handleEditMessage(socket: SocketUser, data: EditMessageData): Promise<void> {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }

            const message = await Message.findById(data.messageId);
            if (!message) {
                socket.emit('error', { message: 'Message not found' });
                return;
            }

            // Check if user is the sender
            if (message.sender.toString() !== socket.user._id) {
                socket.emit('error', { message: 'Not authorized to edit this message' });
                return;
            }

            // Check if message can be edited (not too old, not deleted)
            const messageAge = Date.now() - message.timestamp.getTime();
            const maxEditTime = 48 * 60 * 60 * 1000; // 48 hours

            if (messageAge > maxEditTime) {
                socket.emit('error', { message: 'Message too old to edit' });
                return;
            }

            if (message.isDeleted || message.deletedForEveryone) {
                socket.emit('error', { message: 'Cannot edit deleted message' });
                return;
            }

            // Save current content to edit history
            const editHistory = message.editHistory || [];
            editHistory.push({
                content: message.content,
                editedAt: new Date()
            });

            // Update message
            await Message.findByIdAndUpdate(data.messageId, {
                content: data.newContent,
                isEdited: true,
                editHistory: editHistory
            });

            // Determine target users
            let targetUserIds: string[] = [];
            if (data.chatType === 'user') {
                targetUserIds = [data.chatId, socket.user._id];
            } else {
                const group = await Group.findById(data.chatId)
                if (group) {
                    targetUserIds = group.members.map(member => member.user.toString());
                }
            }

            // Send edit event to all target users
            this.sendToUserSockets(targetUserIds, 'message-edited', {
                messageId: data.messageId,
                newContent: data.newContent,
                isEdited: true,
                editHistory: editHistory
            });

        } catch (error) {
            // console.error('Edit message error:', error);
            socket.emit('error', { message: 'Failed to edit message' });
        }
    }

    private async handleDeleteMessages(socket: SocketUser, data: DeleteMultipleMessagesData): Promise<void> {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }

            if (!data.messageIds || data.messageIds.length === 0) {
                socket.emit('error', { message: 'No messages selected for deletion' });
                return;
            }

            // Fetch all messages
            const messages = await Message.find({ _id: { $in: data.messageIds } });
            if (messages.length === 0) {
                socket.emit('error', { message: 'No messages found' });
                return;
            }

            const deletedMessageIds: string[] = [];
            const unauthorizedMessageIds: string[] = [];

            if (data.deleteType === 'delete_for_everyone') {
                // Check admin rights for group chats
                let isGroupAdmin = false;
                if (data.chatType === 'group') {
                    const group = await Group.findById(data.chatId).populate('members.user');
                    if (group) {
                        const userMember = group.members.find(member =>
                            member.user._id!.toString() === socket.user!._id
                        );
                        isGroupAdmin = (userMember && userMember.role === "admin" ) as boolean;
                    }
                }

                // Process each message
                for (const message of messages) {
                    const canDeleteForEveryone = message.sender.toString() === socket.user._id || isGroupAdmin;

                    if (!canDeleteForEveryone) {
                        unauthorizedMessageIds.push((message?._id as mongoose.Types.ObjectId).toString());
                        continue;
                    }

                    deletedMessageIds.push((message._id as mongoose.Types.ObjectId).toString());
                }

                if (unauthorizedMessageIds.length > 0) {
                    socket.emit('error', {
                        message: `Not authorized to delete ${unauthorizedMessageIds.length} message(s) for everyone`,
                        unauthorizedIds: unauthorizedMessageIds
                    });
                }

                if (deletedMessageIds.length > 0) {
                    // Bulk update messages for delete for everyone
                    await Message.updateMany(
                        { _id: { $in: deletedMessageIds } },
                        {
                            content: 'This message was deleted',
                            isDeleted: true,
                            deletedForEveryone: true,
                            deletedAt: new Date(),
                            $push: {
                                deletedBy: {
                                    user: socket.user._id,
                                    deletedAt: new Date(),
                                    deleteType: 'delete_for_everyone'
                                }
                            }
                        }
                    );

                    // Determine target users
                    let targetUserIds: string[] = [];
                    if (data.chatType === 'user') {
                        targetUserIds = [data.chatId, socket.user._id];
                    } else {
                        const group = await Group.findById(data.chatId)
                        if (group) {
                            targetUserIds = group.members.map(member => member.user.toString());
                        }
                    }

                    // Send to all target users
                    this.sendToUserSockets(targetUserIds, 'messages-deleted', {
                        messageIds: deletedMessageIds,
                        deleteType: 'delete_for_everyone',
                        deletedForEveryone: true,
                        isDeleted: true
                    });
                }

            } else {
                // Delete for me only - user can delete any message for themselves
                deletedMessageIds.push(...data.messageIds);

                // Bulk update messages for delete for me
                await Message.updateMany(
                    { _id: { $in: data.messageIds } },
                    {
                        $push: {
                            deletedBy: {
                                user: socket.user._id,
                                deletedAt: new Date(),
                                deleteType: 'delete_for_me'
                            }
                        }
                    }
                );

                // Emit only to the user who deleted
                socket.emit('messages-deleted', {
                    messageIds: deletedMessageIds,
                    deleteType: 'delete_for_me',
                    deletedForEveryone: false,
                    isDeleted: true
                });
            }

        } catch (error) {
            // console.error('Delete messages error:', error);
            socket.emit('error', { message: 'Failed to delete messages' });
        }
    }

    private async handleForwardMessages(socket: SocketUser, data: ForwardMultipleMessageData): Promise<void> {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }

            // Fetch all original messages
            const originalMessages : IMessage[] = await Message.find({
                _id: { $in: data.originalMessageIds }
            }).populate('sender', 'username');

            if (originalMessages.length === 0) {
                socket.emit('error', { message: 'No original messages found' });
                return;
            }

            // Check access for all messages
            const accessibleMessages = [];
            for (const originalMessage of originalMessages) {
                const hasAccess = originalMessage.sender._id.toString() === socket.user._id ||
                    (originalMessage.recipient && originalMessage.recipient.toString() === socket.user._id) ||
                    (originalMessage.group && await this.checkGroupMembership(socket.user._id, originalMessage.group.toString()));

                if (hasAccess) {
                    accessibleMessages.push(originalMessage);
                }
            }

            if (accessibleMessages.length === 0) {
                socket.emit('error', { message: 'No access to any of the selected messages' });
                return;
            }

            const forwardResults = [];
            const failedForwards = [];

            // Process each target chat
            for (const targetChatId of data.targetChatIds) {
                try {
                    let targetUserIds: string[] = [];

                    // Validate target chat and get target user IDs
                    if (data.targetChatType === 'user') {
                        const targetUser = await User.findById(targetChatId);
                        if (!targetUser) {
                            failedForwards.push({
                                targetId: targetChatId,
                                error: 'Target user not found',
                                messageIds: data.originalMessageIds
                            });
                            continue;
                        }
                        targetUserIds = [targetChatId, socket.user._id];
                    } else {
                        const targetGroup = await Group.findById(targetChatId)
                        if (!targetGroup) {
                            failedForwards.push({
                                targetId: targetChatId,
                                error: 'Target group not found',
                                messageIds: data.originalMessageIds
                            });
                            continue;
                        }

                        const isMember = await this.checkGroupMembership(socket.user._id, targetChatId);
                        if (!isMember) {
                            failedForwards.push({
                                targetId: targetChatId,
                                error: 'Not a member of target group',
                                messageIds: data.originalMessageIds
                            });
                            continue;
                        }

                        targetUserIds = targetGroup.members.map(member => member.user.toString());
                    }

                    const forwardedMessagesForTarget = [];

                    // Forward each accessible message to this target
                    for (const originalMessage of accessibleMessages) {
                        try {
                            const forwardedMessage = new Message({
                                sender: socket.user._id,
                                ...(data.targetChatType === 'user'
                                        ? { recipient: targetChatId }
                                        : { group: targetChatId }
                                ),
                                content: originalMessage.content,
                                messageType: originalMessage.messageType,
                                attachments: originalMessage.attachments,
                                isForwarded: true,
                                originalMessage: originalMessage._id,
                                forwardedFrom: {
                                    user: originalMessage.sender._id,
                                    chatType: originalMessage.recipient ? 'user' : 'group'
                                },
                                timestamp: new Date(),
                                status: 'sent'
                            });

                            const savedMessage = await forwardedMessage.save();
                            await savedMessage.populate('sender', 'username avatar');

                            forwardedMessagesForTarget.push({
                                originalMessageId: (originalMessage._id as mongoose.Types.ObjectId).toString(),
                                forwardedMessage: savedMessage
                            });

                            // Send message to all target users
                            this.sendToUserSockets(targetUserIds, 'new-message', {
                                chatId: targetChatId,
                                chatType: data.targetChatType,
                                message: savedMessage
                            });

                        } catch (messageError) {
                            // console.error(`Error forwarding message ${originalMessage._id} to ${targetChatId}:`, messageError);
                        }
                    }

                    if (forwardedMessagesForTarget.length > 0) {
                        forwardResults.push({
                            targetChatId,
                            targetChatType: data.targetChatType,
                            messages: forwardedMessagesForTarget
                        });
                    }

                } catch (error) {
                    // console.error(`Error processing target ${targetChatId}:`, error);
                    failedForwards.push({
                        targetId: targetChatId,
                        error: 'Failed to process target chat',
                        messageIds: data.originalMessageIds
                    });
                }
            }

            // Update forward counts for original messages
            const forwardCountUpdates : any = {};
            forwardResults.forEach(result => {
                result.messages.forEach(msg => {
                    const originalId = msg.originalMessageId;
                    forwardCountUpdates[originalId] = (forwardCountUpdates[originalId] || 0) + 1;
                });
            });

            // Batch update forward counts
            for (const [messageId, count] of Object.entries(forwardCountUpdates)) {
                await Message.findByIdAndUpdate(messageId, {
                    $inc: { forwardCount: count }
                });
            }

        } catch (error) {
            // console.error('Forward messages error:', error);
            socket.emit('error', { message: 'Failed to forward messages' });
        }
    }

    private async handleMarkMessagesRead(socket: SocketUser, data: MarkReadData): Promise<void> {
        try {
            if (!socket.user) return;

            const readBy = {
                user: socket.user._id,
                readAt: new Date()
            };

            // Update messages
            await Message.updateMany(
                {
                    _id: { $in: data.messageIds },
                    'readBy.user': { $ne: socket.user._id }
                },
                {
                    $push: { readBy: readBy },
                    status: 'read'
                }
            );

            // Determine target users
            let targetUserIds: string[] = [];
            if (data.chatType === 'user') {
                targetUserIds = [data.chatId, socket.user._id];
            } else {
                const group = await Group.findById(data.chatId)
                if (group) {
                    targetUserIds = group.members.map(member => member.user.toString());
                }
            }

            // Send read receipt to all target users
            this.sendToUserSockets(targetUserIds, 'message-read', {
                messageIds: data.messageIds,
                readBy: [readBy],
                status: 'read'
            });

        } catch (error) {
            // console.error('Mark messages read error:', error);
        }
    }

    private handleTypingStart(socket: SocketUser, data: TypingData): void {
        if (!socket.user) return;

        const typingKey = `${data.chatType}-${data.chatId}`;

        if (!typingUsers.has(typingKey)) {
            typingUsers.set(typingKey, new Set());
        }

        typingUsers.get(typingKey)!.add(socket.user._id);

        // Determine target users (excluding sender)
        let targetUserIds: string[] = [];
        if (data.chatType === 'user') {
            targetUserIds = [data.chatId]; // Only recipient for direct messages
        } else {
            // For groups, we need to get all members except sender
            Group.findById(data.chatId).then(group => {
                if (group) {
                    targetUserIds = group.members
                        .map(member => member.user.toString())
                        .filter(id => id !== socket.user!._id);

                    this.sendToUserSockets(targetUserIds, 'typing-start', {
                        userId: socket.user._id,
                        chatId: data.chatId,
                        chatType: data.chatType,
                        name : socket.user.username
                    });
                }
            });
            return;
        }

        // console.log("Emiting typeing" , {
            // userId: socket.user._id,
            // chatId: data.chatId,
            // chatType: data.chatType,
            // name : socket.user.username
        // })

        this.sendToUserSockets(targetUserIds, 'typing-start', {
            userId: socket.user._id,
            chatId: data.chatId,
            chatType: data.chatType,
            name : socket.user.username
        });
    }

    private handleTypingStop(socket: SocketUser, data: TypingData): void {
        if (!socket.user) return;

        const typingKey = `${data.chatType}-${data.chatId}`;

        if (typingUsers.has(typingKey)) {
            typingUsers.get(typingKey)!.delete(socket.user._id);

            if (typingUsers.get(typingKey)!.size === 0) {
                typingUsers.delete(typingKey);
            }
        }

        // Determine target users (excluding sender)
        let targetUserIds: string[] = [];
        if (data.chatType === 'user') {
            targetUserIds = [data.chatId]; // Only recipient for direct messages
        } else {
            // For groups, we need to get all members except sender
            Group.findById(data.chatId).then(group => {
                if (group) {
                    targetUserIds = group.members
                        .map(member => member.user.toString())
                        .filter(id => id !== socket.user!._id);

                    this.sendToUserSockets(targetUserIds, 'typing-stop', {
                        userId: socket.user._id,
                        chatId: data.chatId,
                        chatType: data.chatType,
                        name : socket.user.username
                    });
                }
            });
            return;
        }

        this.sendToUserSockets(targetUserIds, 'typing-stop', {
            userId: socket.user._id,
            chatId: data.chatId,
            chatType: data.chatType,
            name : socket?.user?.username
        });
    }

    private handleFileUploadStart(socket: SocketUser, data: FileUploadStartData): void {
        if (!socket.user) return;

        const session: FileUploadSession = {
            uploadId: data.uploadId,
            fileName: data.fileName,
            fileSize: data.fileSize,
            fileType: data.fileType,
            totalChunks: data.totalChunks,
            receivedChunks: new Array(data.totalChunks),
            chatId: data.chatId,
            chatType: data.chatType,
            userId: socket.user._id
        };

        fileUploadSessions.set(data.uploadId, session);
    }

    // Handle file upload chunk
    private async handleFileUploadChunk(socket: SocketUser, data: FileUploadChunkData): Promise<void> {
        try {
            const session = fileUploadSessions.get(data.uploadId);
            if (!session) {
                socket.emit('file-upload-error', {
                    uploadId: data.uploadId,
                    error: 'Upload session not found'
                });
                return;
            }

            // Store chunk
            session.receivedChunks[data.chunkIndex] = Buffer.from(data.chunk);

            // Emit progress
            const progress = Math.round(((data.chunkIndex + 1) / session.totalChunks) * 100);
            socket.emit('file-upload-progress', {
                uploadId: data.uploadId,
                progress: progress
            });

            // Check if all chunks received
            const allChunksReceived = session.receivedChunks.every(chunk => chunk !== undefined);

            if (allChunksReceived) {
                // Combine chunks
                const fileBuffer = Buffer.concat(session.receivedChunks);

                // Upload to cloud storage
                const fileUrl = await uploadFileToCloud(fileBuffer, session.fileName, session.fileType);

                // Generate thumbnail if image
                let thumbnailUrl: string | undefined;
                if (session.fileType.startsWith('image/')) {
                    thumbnailUrl = await generateThumbnail(fileBuffer, session.fileName);
                }

                // Emit completion
                socket.emit('file-upload-complete', {
                    uploadId: data.uploadId,
                    fileUrl: fileUrl,
                    thumbnailUrl: thumbnailUrl
                });

                // Clean up session
                fileUploadSessions.delete(data.uploadId);
            }

        } catch (error) {
            // console.error('File upload chunk error:', error);
            socket.emit('file-upload-error', {
                uploadId: data.uploadId,
                error: 'Upload failed'
            });
            fileUploadSessions.delete(data.uploadId);
        }
    }

    // Handle disconnect
    private handleDisconnect(socket: SocketUser): void {
        if (socket.user) {
            activeUsers.delete(socket.user._id);

            // Clean up typing status
            typingUsers.forEach((users, key) => {
                if (users.has(socket.user!._id)) {
                    users.delete(socket.user!._id);
                    if (users.size === 0) {
                        typingUsers.delete(key);
                    }

                    // Emit typing stop to relevant rooms
                    const [chatType, chatId] = key.split('-');
                    const roomId = `${chatType}-${chatId}`;
                    socket.to(roomId).emit('typing-stop', {
                        userId: socket.user!._id,
                        chatId: chatId,
                        chatType: chatType
                    });
                }
            });

            socket.broadcast.emit('user-offline', {
                userId: socket.user._id,
            })

            // console.log(`User ${socket.user._id} disconnected`);
        }
    }

    // Helper method to check group membership
    private async checkGroupMembership(userId: string, groupId: string): Promise<boolean> {
        try {
            const group = await Group.findById(groupId);
            if (!group) return false;

            return group.members.some(member => member.user.toString() === userId);
        } catch (error) {
            return false;
        }
    }
}