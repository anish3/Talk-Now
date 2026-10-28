import { Socket } from "socket.io";
import http from "http";
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from "./Room";
import cors from "cors"
const app = express();
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3100",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3100",
  "https://talk-now-nine.vercel.app",
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true,
}));

const server = http.createServer(app);
const port = process.env.PORT || 8000;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.get("/" , (req , res)=>{
  return res.json({status: "Server working"})
})
const manager = new RoomManager(io)

io.on('connection', (socket: Socket) => {
  console.log("user connected :: " , socket.id)
  manager.handleConnect(socket.id)
  socket.on("join" , (payload?: unknown)=>{
    console.log("user joined :: " , socket.id)
    manager.addUser(socket.id, payload as any)
  })
  socket.on("disconnect", () => {
    console.log("user disconnected :: " , socket.id) 
    manager.handleDisconnect(socket.id)
  }
  )
  socket.on("message" , (roomId:string ,message:string)=>{
    manager.handleMessage(roomId,socket.id , message)
  })
  socket.on("offer" , (roomId:string , offer:any)=>{
    console.log("offer -> ")
    manager.handleOffer(socket.id ,roomId , offer)
  })

  socket.on("answer" , (roomId:string , offer:any)=>{
    console.log("answer -> ")

    manager.handleAnswer(socket.id , roomId , offer)
  })
  socket.on("ice-candidates" , (roomId:string , iceCandidates:any)=>{
    console.log("iceCandidates -> " )

    manager.handleIceCandidates(socket.id , roomId , iceCandidates)
  })

  socket.on("leaveRoom" , (roomId:string)=>{
    console.log("LEAVE ROOM REQUEST FROM " , socket.id)
    manager.handleLeaveRoom(socket.id)
  })

  socket.on("quest:update" , (roomId:string , quest:any)=>{
    manager.handleQuestUpdate(socket.id, roomId, quest)
  })

  socket.on("reveal:consent" , (roomId:string , consent:boolean)=>{
    manager.handleRevealConsent(socket.id, roomId, consent)
  })
});

server.listen(Number(port) , "0.0.0.0", () => {
    console.log('listening on *:' , port);

});
