import http from "http";
import { Server , Socket } from "socket.io";
import config from "@/config";
import {ChatHandlers} from "@/socket/handlers/chat-handlers";
import {SocketUser} from "@/types";


export const setUpSocket = (server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>) => {
    const io = new Server(server , {
        cors : {
            methods : ["GET" , "POST"],
            origin : config.cors.origin,
            credentials : true,
        },
    });

    const chatHandlers = new ChatHandlers(io);



    io.on("connection" , (socket :Socket) => {
        const sock = socket as SocketUser;
        const {userId , username } = socket.handshake.query;
        sock.user = {
            _id : userId as string ,
            username : username as string
        }

        chatHandlers.initializeHandlers(sock);
    });
};
