
import { Socket } from "socket.io";
import { v4 as uuidv4 } from 'uuid';
import Queue from "./Queue";
import { Server } from 'socket.io';


/*
const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.l.google.com:5349" },
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun1.l.google.com:5349" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:5349" },
    { urls: "stun:stun3.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:5349" }
];

*/

let NUM_OF_PLAYERS = 0
interface User {
    id: string;
}

interface Room {
    user1: User;
    user2: User;
}

export {NUM_OF_PLAYERS}

const queue = new Queue<User>()

export class RoomManager {
    private rooms: Map<string, Room>;
    private io:Server

    private recentPartners: Map<string, string[]> = new Map();

private hasRecentlyMatched(user1: string, user2: string): boolean {
  return (
    (this.recentPartners.get(user1) ?? []).includes(user2) ||
    (this.recentPartners.get(user2) ?? []).includes(user1)
  );
}

private rememberMatch(user1: string, user2: string): void {
  const remember = (user: string, partner: string) => {
    const previous = this.recentPartners.get(user) ?? [];
    this.recentPartners.set(
      user,
      [partner, ...previous.filter((id) => id !== partner)].slice(0, 5)
    );
  };

  remember(user1, user2);
  remember(user2, user1);
}

    constructor(io:Server) {
        this.rooms = new Map<string, Room>();
        this.io = io;
    }

    createRoom(user1: User , user2: User){
        const roomId = uuidv4()
        this.rooms.set(roomId , {user1 ,user2})
        return roomId
    }


    
async addUser(socketId: string) {
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Prevent duplicate queue entries.
  if (queue.find(socketId)) {
    return;
  }

  NUM_OF_PLAYERS++;

  console.log("Number of players --->", socketId, "=>", NUM_OF_PLAYERS);

  queue.enqueue({ id: socketId });
  console.log("PLAYERS IN QUEUE ->", queue.size());

  this.io.emit("user-count", NUM_OF_PLAYERS);

  if (queue.size() < 2) {
    console.log("NO PAIR FOUND");
    return;
  }

  // Collect waiting users.
  const waitingUsers: User[] = [];

  while (queue.size() > 0) {
    const user = queue.dequeue();
    if (user) waitingUsers.push(user);
  }

  if (waitingUsers.length < 2) {
    waitingUsers.forEach((user) => queue.enqueue(user));
    return;
  }

  // Keep the longest-waiting user first.
  const user1 = waitingUsers[0];
  const candidates = waitingUsers.slice(1);

  // Prefer a partner not matched recently.
  const freshCandidates = candidates.filter(
    (candidate) =>
      !this.hasRecentlyMatched(user1.id, candidate.id)
  );

  // Allow a repeat if no alternative is available.
  const availableCandidates =
    freshCandidates.length > 0 ? freshCandidates : candidates;

  const randomIndex = Math.floor(
    Math.random() * availableCandidates.length
  );

  const user2 = availableCandidates[randomIndex];

  // Put unmatched users back in the queue.
  const selectedIds = new Set([user1.id, user2.id]);

  waitingUsers
    .filter((user) => !selectedIds.has(user.id))
    .forEach((user) => queue.enqueue(user));

  this.rememberMatch(user1.id, user2.id);

  console.log(":: Random pair found ::", user1.id, user2.id);

  const room = this.createRoom(user1, user2);

  this.io.to(user1.id).to(user2.id).emit("joined", { room });
  this.io.to(user1.id).emit("send-offer");

  console.log("sent offer request to ::", user1.id);
}


    handleOffer(socketId:string , roomId:string, offer:any){
        console.log("OFFER SENT BY :: " , socketId , " FOR ROOM ::  " , roomId)

        const room = this.rooms.get(roomId)
        if(!room) return
        const reciever = room?.user1.id===socketId ? room.user2.id : room?.user1.id
        console.log("SENDING OFFER TO  :: " , reciever)
        
        this.io.to(reciever).emit("offer" , offer)

    }
    
    handleAnswer(socketId:string , roomId:string, offer:any){

        const room = this.rooms.get(roomId)
        if(!room) return
        const reciever = room?.user1.id===socketId ? room.user2.id : room?.user1.id
        console.log("RECIEVED ANSWER SENDING TO :: " , reciever)

        
        this.io.to(reciever).emit("answer" , offer)

    }

    handleIceCandidates(socketId:string , roomId:string , iceCandidates:any){
        const room = this.rooms.get(roomId)
        if(!room) return

        const reciever = room?.user1.id===socketId ? room.user2.id : room?.user1.id
        this.io.to(reciever).emit("ice-candidates" , iceCandidates)
    }

    

    handleDisconnect(socketId:string){
        console.log("DISCONNECTED :: " , socketId)
        const itemToRemove = queue.find(socketId);
        NUM_OF_PLAYERS--;
        queue.printQueue()
        if (itemToRemove) {
            queue.remove(itemToRemove);
            console.log(`Removed item with id ${socketId}.`);
        }
        queue.printQueue()
        this.rooms.forEach((room , roomId)=>{
            console.log("ROOM ::  " , roomId , "USER1 :: ", room.user1.id , "  USER2 :: " , room.user2.id)
            if(room.user1.id==socketId || room.user2.id == socketId){
                this.rooms.delete(roomId)
                console.log("DELETING ROOM :: " , roomId)
                this.io.to(room.user1.id).to(room?.user2.id).emit("leaveRoom")
            }
        })
        this.io.emit("user-count" , NUM_OF_PLAYERS)
    }

    handleLeaveRoom(socketId:string){
        console.log("LEAVING REQUEST FROM :: " , socketId)
        this.rooms.forEach((room , roomId)=>{
            console.log("ROOM ::  " , roomId , "USER1 :: ", room.user1.id , "  USER2 :: " , room.user2.id)
            if(room.user1.id==socketId || room.user2.id == socketId){
                this.rooms.delete(roomId)
                console.log("DELETING ROOM :: " , roomId)
                
                this.io.to(room.user1.id).to(room?.user2.id).emit("leaveRoom")
            }
        })
    }

    handleMessage(roomId:string , socketId:string ,message:string){
        console.log("MESSAGE RECIEVED IN ::  " , roomId)
        const room = this.rooms.get(roomId)
        if(!room) return

        const reciever = room?.user1.id===socketId ? room.user2.id : room?.user1.id
        this.io.to(reciever).emit("message" , message)
    }
    
   
  
}


