"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatHandlers = void 0;
const message_1 = __importDefault(require("@/models/message"));
const group_1 = __importDefault(require("@/models/group"));
const user_1 = require("@/models/user");
const file_upload_1 = require("@/utils/file-upload");
const mongoose_1 = __importDefault(require("mongoose"));
// File upload sessions storage
const fileUploadSessions = new Map();
// Active users and typing status
const activeUsers = new Map();
const typingUsers = new Map();
class ChatHandlers {
    constructor(io) {
        this.io = io;
    }
    initializeHandlers(socket) {
        // Store user connection
        if (socket.user) {
            activeUsers.set(socket.user._id, socket);
            socket.broadcast.emit('user-online', {
                userId: socket.user._id,
            });
            socket.emit("get-online-list", {
                list: [...activeUsers.keys()]
            });
        }
        // Chat room management (keeping for compatibility but not using rooms)
        socket.on('join-chat', (data) => this.handleJoinChat(socket, data));
        socket.on('leave-chat', (data) => this.handleLeaveChat(socket, data));
        // Message handling
        socket.on('send-message', (data) => this.handleSendMessage(socket, data));
        socket.on('edit-message', (data) => this.handleEditMessage(socket, data));
        socket.on('delete-messages', (data) => this.handleDeleteMessages(socket, data));
        socket.on('forward-messages', (data) => this.handleForwardMessages(socket, data));
        socket.on('mark-messages-read', (data) => this.handleMarkMessagesRead(socket, data));
        // Typing indicators
        socket.on('typing-start', (data) => this.handleTypingStart(socket, data));
        socket.on('typing-stop', (data) => this.handleTypingStop(socket, data));
        socket.on("message:react", (payload) => this.handleReactToMessage(socket, payload));
        // File upload handling
        socket.on('file-upload-start', (data) => this.handleFileUploadStart(socket, data));
        socket.on('file-upload-chunk', (data) => this.handleFileUploadChunk(socket, data));
        // Disconnect handling
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }
    handleJoinChat(socket, data) {
        // Keeping for compatibility but not using rooms
        console.log(`User ${socket.user?._id} joined chat ${data.chatId}`);
    }
    handleLeaveChat(socket, data) {
        // Stop typing if user was typing
        this.handleTypingStop(socket, data);
        console.log(`User ${socket.user?._id} left chat ${data.chatId}`);
    }
    // Helper method to send message to all relevant user sockets
    sendToUserSockets(userIds, event, data) {
        userIds.forEach(userId => {
            const userSockets = Array.from(this.io.sockets.sockets.values())
                .filter(s => s.user?._id === userId);
            userSockets.forEach(userSocket => {
                userSocket.emit(event, data);
            });
        });
    }
    async handleSendMessage(socket, data) {
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
            let chatId;
            let chatType;
            let targetUserIds = [];
            if (data.recipient) {
                // Direct message
                const recipient = await user_1.User.findById(data.recipient);
                if (!recipient) {
                    socket.emit('error', { message: 'Recipient not found' });
                    return;
                }
                chatId = data.recipient;
                chatType = 'user';
                targetUserIds = [data.recipient, socket.user._id]; // Both sender and recipient
            }
            else if (data.group) {
                // Group message
                const group = await group_1.default.findById(data.group);
                if (!group) {
                    socket.emit('error', { message: 'Group not found' });
                    return;
                }
                // Check if user is member of group
                const isMember = group.members.some(member => member.user.toString() === socket.user._id);
                if (!isMember) {
                    socket.emit('error', { message: 'Not a member of this group' });
                    return;
                }
                chatId = data.group;
                chatType = 'group';
                targetUserIds = group.members.map(member => member.user.toString()); // All group members
            }
            else {
                socket.emit('error', { message: 'Invalid chat data' });
                return;
            }
            // Validate reply message if replying
            if (data.messageData.replyTo) {
                const replyMessage = await message_1.default.findById(data.messageData.replyTo);
                if (!replyMessage) {
                    socket.emit('error', { message: 'Reply message not found' });
                    return;
                }
            }
            // Handle forwarded message
            if (data.messageData.isForwarded && data.messageData.originalMessage) {
                const originalMessage = await message_1.default.findById(data.messageData.originalMessage);
                if (originalMessage) {
                    // Increment forward count
                    await message_1.default.findByIdAndUpdate(data.messageData.originalMessage, { $inc: { forwardCount: 1 } });
                }
            }
            // Create message
            const messageDoc = new message_1.default({
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
            await message_1.default.findByIdAndUpdate(savedMessage._id, {
                status: 'delivered'
            });
            // Stop typing for sender
            this.handleTypingStop(socket, { chatId, chatType });
        }
        catch (error) {
            // console.error('Send message error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }
    async handleReactToMessage(socket, payload) {
        try {
            const { recipient, group, messageData } = payload;
            const senderId = socket.user._id;
            if (!senderId || !messageData?.reactionTo || !messageData?.reaction) {
                return socket.emit("error", { message: "Invalid reaction payload" });
            }
            const originalMessage = await message_1.default.findById(messageData.reactionTo);
            if (!originalMessage) {
                return socket.emit("error", { message: "Original message not found" });
            }
            // Remove existing reaction by the user (if any)
            originalMessage.reactions = originalMessage.reactions.filter((r) => !r.user.equals(senderId));
            // Add new reaction
            originalMessage.reactions.push({
                emoji: messageData.reaction,
                user: new mongoose_1.default.Types.ObjectId(senderId),
            });
            await originalMessage.save();
            // Determine target users
            let targetUserIds = [];
            if (recipient) {
                targetUserIds = [recipient, senderId];
            }
            else if (group) {
                const groupDoc = await group_1.default.findById(group);
                if (groupDoc) {
                    targetUserIds = groupDoc.members.map(member => member.user.toString());
                }
            }
            // Send updated reaction to all target users
            this.sendToUserSockets(targetUserIds, "message:reaction:updated", {
                messageId: originalMessage._id,
                reactions: originalMessage.reactions,
            });
        }
        catch (err) {
            // console.error("Error in message:react:", err);
            socket.emit("error", { message: "Failed to react to message" });
        }
    }
    async handleEditMessage(socket, data) {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }
            const message = await message_1.default.findById(data.messageId);
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
            await message_1.default.findByIdAndUpdate(data.messageId, {
                content: data.newContent,
                isEdited: true,
                editHistory: editHistory
            });
            // Determine target users
            let targetUserIds = [];
            if (data.chatType === 'user') {
                targetUserIds = [data.chatId, socket.user._id];
            }
            else {
                const group = await group_1.default.findById(data.chatId);
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
        }
        catch (error) {
            // console.error('Edit message error:', error);
            socket.emit('error', { message: 'Failed to edit message' });
        }
    }
    async handleDeleteMessages(socket, data) {
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
            const messages = await message_1.default.find({ _id: { $in: data.messageIds } });
            if (messages.length === 0) {
                socket.emit('error', { message: 'No messages found' });
                return;
            }
            const deletedMessageIds = [];
            const unauthorizedMessageIds = [];
            if (data.deleteType === 'delete_for_everyone') {
                // Check admin rights for group chats
                let isGroupAdmin = false;
                if (data.chatType === 'group') {
                    const group = await group_1.default.findById(data.chatId).populate('members.user');
                    if (group) {
                        const userMember = group.members.find(member => member.user._id.toString() === socket.user._id);
                        isGroupAdmin = (userMember && userMember.role === "admin");
                    }
                }
                // Process each message
                for (const message of messages) {
                    const canDeleteForEveryone = message.sender.toString() === socket.user._id || isGroupAdmin;
                    if (!canDeleteForEveryone) {
                        unauthorizedMessageIds.push((message?._id).toString());
                        continue;
                    }
                    deletedMessageIds.push(message._id.toString());
                }
                if (unauthorizedMessageIds.length > 0) {
                    socket.emit('error', {
                        message: `Not authorized to delete ${unauthorizedMessageIds.length} message(s) for everyone`,
                        unauthorizedIds: unauthorizedMessageIds
                    });
                }
                if (deletedMessageIds.length > 0) {
                    // Bulk update messages for delete for everyone
                    await message_1.default.updateMany({ _id: { $in: deletedMessageIds } }, {
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
                    });
                    // Determine target users
                    let targetUserIds = [];
                    if (data.chatType === 'user') {
                        targetUserIds = [data.chatId, socket.user._id];
                    }
                    else {
                        const group = await group_1.default.findById(data.chatId);
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
            }
            else {
                // Delete for me only - user can delete any message for themselves
                deletedMessageIds.push(...data.messageIds);
                // Bulk update messages for delete for me
                await message_1.default.updateMany({ _id: { $in: data.messageIds } }, {
                    $push: {
                        deletedBy: {
                            user: socket.user._id,
                            deletedAt: new Date(),
                            deleteType: 'delete_for_me'
                        }
                    }
                });
                // Emit only to the user who deleted
                socket.emit('messages-deleted', {
                    messageIds: deletedMessageIds,
                    deleteType: 'delete_for_me',
                    deletedForEveryone: false,
                    isDeleted: true
                });
            }
        }
        catch (error) {
            // console.error('Delete messages error:', error);
            socket.emit('error', { message: 'Failed to delete messages' });
        }
    }
    async handleForwardMessages(socket, data) {
        try {
            if (!socket.user) {
                socket.emit('error', { message: 'User not authenticated' });
                return;
            }
            // Fetch all original messages
            const originalMessages = await message_1.default.find({
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
                    let targetUserIds = [];
                    // Validate target chat and get target user IDs
                    if (data.targetChatType === 'user') {
                        const targetUser = await user_1.User.findById(targetChatId);
                        if (!targetUser) {
                            failedForwards.push({
                                targetId: targetChatId,
                                error: 'Target user not found',
                                messageIds: data.originalMessageIds
                            });
                            continue;
                        }
                        targetUserIds = [targetChatId, socket.user._id];
                    }
                    else {
                        const targetGroup = await group_1.default.findById(targetChatId);
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
                            const forwardedMessage = new message_1.default({
                                sender: socket.user._id,
                                ...(data.targetChatType === 'user'
                                    ? { recipient: targetChatId }
                                    : { group: targetChatId }),
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
                                originalMessageId: originalMessage._id.toString(),
                                forwardedMessage: savedMessage
                            });
                            // Send message to all target users
                            this.sendToUserSockets(targetUserIds, 'new-message', {
                                chatId: targetChatId,
                                chatType: data.targetChatType,
                                message: savedMessage
                            });
                        }
                        catch (messageError) {
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
                }
                catch (error) {
                    // console.error(`Error processing target ${targetChatId}:`, error);
                    failedForwards.push({
                        targetId: targetChatId,
                        error: 'Failed to process target chat',
                        messageIds: data.originalMessageIds
                    });
                }
            }
            // Update forward counts for original messages
            const forwardCountUpdates = {};
            forwardResults.forEach(result => {
                result.messages.forEach(msg => {
                    const originalId = msg.originalMessageId;
                    forwardCountUpdates[originalId] = (forwardCountUpdates[originalId] || 0) + 1;
                });
            });
            // Batch update forward counts
            for (const [messageId, count] of Object.entries(forwardCountUpdates)) {
                await message_1.default.findByIdAndUpdate(messageId, {
                    $inc: { forwardCount: count }
                });
            }
        }
        catch (error) {
            // console.error('Forward messages error:', error);
            socket.emit('error', { message: 'Failed to forward messages' });
        }
    }
    async handleMarkMessagesRead(socket, data) {
        try {
            if (!socket.user)
                return;
            const readBy = {
                user: socket.user._id,
                readAt: new Date()
            };
            // Update messages
            await message_1.default.updateMany({
                _id: { $in: data.messageIds },
                'readBy.user': { $ne: socket.user._id }
            }, {
                $push: { readBy: readBy },
                status: 'read'
            });
            // Determine target users
            let targetUserIds = [];
            if (data.chatType === 'user') {
                targetUserIds = [data.chatId, socket.user._id];
            }
            else {
                const group = await group_1.default.findById(data.chatId);
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
        }
        catch (error) {
            // console.error('Mark messages read error:', error);
        }
    }
    handleTypingStart(socket, data) {
        if (!socket.user)
            return;
        const typingKey = `${data.chatType}-${data.chatId}`;
        if (!typingUsers.has(typingKey)) {
            typingUsers.set(typingKey, new Set());
        }
        typingUsers.get(typingKey).add(socket.user._id);
        // Determine target users (excluding sender)
        let targetUserIds = [];
        if (data.chatType === 'user') {
            targetUserIds = [data.chatId]; // Only recipient for direct messages
        }
        else {
            // For groups, we need to get all members except sender
            group_1.default.findById(data.chatId).then(group => {
                if (group) {
                    targetUserIds = group.members
                        .map(member => member.user.toString())
                        .filter(id => id !== socket.user._id);
                    this.sendToUserSockets(targetUserIds, 'typing-start', {
                        userId: socket.user._id,
                        chatId: data.chatId,
                        chatType: data.chatType,
                        name: socket.user.username
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
            name: socket.user.username
        });
    }
    handleTypingStop(socket, data) {
        if (!socket.user)
            return;
        const typingKey = `${data.chatType}-${data.chatId}`;
        if (typingUsers.has(typingKey)) {
            typingUsers.get(typingKey).delete(socket.user._id);
            if (typingUsers.get(typingKey).size === 0) {
                typingUsers.delete(typingKey);
            }
        }
        // Determine target users (excluding sender)
        let targetUserIds = [];
        if (data.chatType === 'user') {
            targetUserIds = [data.chatId]; // Only recipient for direct messages
        }
        else {
            // For groups, we need to get all members except sender
            group_1.default.findById(data.chatId).then(group => {
                if (group) {
                    targetUserIds = group.members
                        .map(member => member.user.toString())
                        .filter(id => id !== socket.user._id);
                    this.sendToUserSockets(targetUserIds, 'typing-stop', {
                        userId: socket.user._id,
                        chatId: data.chatId,
                        chatType: data.chatType,
                        name: socket.user.username
                    });
                }
            });
            return;
        }
        this.sendToUserSockets(targetUserIds, 'typing-stop', {
            userId: socket.user._id,
            chatId: data.chatId,
            chatType: data.chatType,
            name: socket?.user?.username
        });
    }
    handleFileUploadStart(socket, data) {
        if (!socket.user)
            return;
        const session = {
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
    async handleFileUploadChunk(socket, data) {
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
                const fileUrl = await (0, file_upload_1.uploadFileToCloud)(fileBuffer, session.fileName, session.fileType);
                // Generate thumbnail if image
                let thumbnailUrl;
                if (session.fileType.startsWith('image/')) {
                    thumbnailUrl = await (0, file_upload_1.generateThumbnail)(fileBuffer, session.fileName);
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
        }
        catch (error) {
            // console.error('File upload chunk error:', error);
            socket.emit('file-upload-error', {
                uploadId: data.uploadId,
                error: 'Upload failed'
            });
            fileUploadSessions.delete(data.uploadId);
        }
    }
    // Handle disconnect
    handleDisconnect(socket) {
        if (socket.user) {
            activeUsers.delete(socket.user._id);
            // Clean up typing status
            typingUsers.forEach((users, key) => {
                if (users.has(socket.user._id)) {
                    users.delete(socket.user._id);
                    if (users.size === 0) {
                        typingUsers.delete(key);
                    }
                    // Emit typing stop to relevant rooms
                    const [chatType, chatId] = key.split('-');
                    const roomId = `${chatType}-${chatId}`;
                    socket.to(roomId).emit('typing-stop', {
                        userId: socket.user._id,
                        chatId: chatId,
                        chatType: chatType
                    });
                }
            });
            socket.broadcast.emit('user-offline', {
                userId: socket.user._id,
            });
            // console.log(`User ${socket.user._id} disconnected`);
        }
    }
    // Helper method to check group membership
    async checkGroupMembership(userId, groupId) {
        try {
            const group = await group_1.default.findById(groupId);
            if (!group)
                return false;
            return group.members.some(member => member.user.toString() === userId);
        }
        catch (error) {
            return false;
        }
    }
}
exports.ChatHandlers = ChatHandlers;
