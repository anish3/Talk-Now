import http from "http";
import express from 'express';
import { Server, Socket } from 'socket.io';
import { RoomManager } from "./Room";
import cors from "cors";
const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(",").map(origin => origin.trim()) ?? [],
  methods: ["GET", "POST"],
  credentials: true,
}));

const server = http.createServer(app);
const port = process.env.PORT || 8000;

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(",").map(origin => origin.trim()) ?? [],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.get("/" , (req , res)=>{
  return res.json({status: "Server working"})
})
const manager = new RoomManager(io)

io.on('connection', (socket: Socket) => {
  console.log("[socket] connected", { socketId: socket.id, transport: socket.conn.transport.name });
  socket.on("join" , ()=>{
    console.log("[match] join requested", { socketId: socket.id });
    manager.addUser(socket.id)
  })
  socket.on("disconnect", () => {
    console.log("[socket] disconnected", { socketId: socket.id });
    manager.handleDisconnect(socket.id)
  }
  )
  socket.on("message" , (roomId:string ,message:string)=>{
    console.log("[message] received", { socketId: socket.id, roomId });
    manager.handleMessage(roomId,socket.id , message)
  })
  socket.on("offer" , (roomId:string , offer:any)=>{
    console.log("[webrtc] offer received", { socketId: socket.id, roomId });
    manager.handleOffer(socket.id ,roomId , offer)
  })

  socket.on("answer" , (roomId:string , offer:any)=>{
    console.log("[webrtc] answer received", { socketId: socket.id, roomId });
    manager.handleAnswer(socket.id , roomId , offer)
  })
  socket.on("ice-candidates" , (roomId:string , iceCandidates:any)=>{
    console.log("[webrtc] ICE candidate received", { socketId: socket.id, roomId });
    manager.handleIceCandidates(socket.id , roomId , iceCandidates)
  })
  socket.on("webrtc-state", (roomId: string, state: { iceConnectionState: string; connectionState: string }) => {
    console.log("[webrtc] client connection state", { socketId: socket.id, roomId, ...state });
  });

  socket.on("leaveRoom" , (roomId:string)=>{
    console.log("[match] leave requested", { socketId: socket.id, roomId });
    manager.handleLeaveRoom(socket.id)
  })
});

server.listen(Number(port) , "0.0.0.0", () => {
    console.log('[server] listening', { port, origins: process.env.CORS_ORIGINS ?? "" });

});