import { io } from 'socket.io-client'

export function createSocket(baseUrl) {
  const socket = io(baseUrl, { transports: ['websocket'] })
  return socket
}
