"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUpSocket = void 0;
const socket_io_1 = require("socket.io");
const config_1 = __importDefault(require("@/config"));
const chat_handlers_1 = require("@/socket/handlers/chat-handlers");
const setUpSocket = (server) => {
    const io = new socket_io_1.Server(server, {
        cors: {
            methods: ["GET", "POST"],
            origin: config_1.default.cors.origin,
            credentials: true,
        },
    });
    const chatHandlers = new chat_handlers_1.ChatHandlers(io);
    io.on("connection", (socket) => {
        const sock = socket;
        const { userId, username } = socket.handshake.query;
        sock.user = {
            _id: userId,
            username: username
        };
        chatHandlers.initializeHandlers(sock);
    });
};
exports.setUpSocket = setUpSocket;
