import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
const socketUrl = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

export const getSocket = (): Socket | null => socket;

export const connectSocket = (token: string): Socket => {
  if (socket?.connected) {
    return socket;
  }

  socket = io(socketUrl, {
    auth: { token },
    withCredentials: true
  });

  return socket;
};

export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
};
