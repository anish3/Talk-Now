
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

interface User {
    id: string;
}

interface Room {
    user1: User;
    user2: User;
}

export class RoomManager {
    private rooms: Map<string, Room>;
    private io:Server
    private queue: Queue<User>;
    private connectedUsers: Set<string>;
    private pendingJoins: Map<string, ReturnType<typeof setTimeout>>;

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
        this.queue = new Queue<User>();
        this.connectedUsers = new Set<string>();
        this.pendingJoins = new Map<string, ReturnType<typeof setTimeout>>();
    }

    /**
     * Online users means currently connected Socket.IO sockets on this
     * server instance. Searching and matched users both count once; a socket
     * is counted immediately on connection and removed exactly once on
     * disconnect.
     */
    handleConnect(socketId: string): void {
        if (this.connectedUsers.has(socketId)) {
            return;
        }

        this.connectedUsers.add(socketId);
        this.emitOnlineCount();
    }

    getOnlineCount(): number {
        return this.connectedUsers.size;
    }

    private emitOnlineCount(): void {
        this.io.emit("user-count", this.getOnlineCount());
    }

    private isInRoom(socketId: string): boolean {
        for (const room of this.rooms.values()) {
            if (room.user1.id === socketId || room.user2.id === socketId) {
                return true;
            }
        }

        return false;
    }

    private cancelPendingJoin(socketId: string): void {
        const timer = this.pendingJoins.get(socketId);
        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.pendingJoins.delete(socketId);
    }

    createRoom(user1: User , user2: User){
        const roomId = uuidv4()
        this.rooms.set(roomId , {user1 ,user2})
        return roomId
    }


    
addUser(socketId: string): void {
  if (
    !this.connectedUsers.has(socketId) ||
    this.pendingJoins.has(socketId) ||
    this.queue.find(socketId) ||
    this.isInRoom(socketId)
  ) {
    return;
  }

  const timer = setTimeout(() => {
    this.pendingJoins.delete(socketId);

    if (
      !this.connectedUsers.has(socketId) ||
      this.queue.find(socketId) ||
      this.isInRoom(socketId)
    ) {
      return;
    }

    this.queue.enqueue({ id: socketId });
    console.log("PLAYERS IN QUEUE ->", this.queue.size());
    this.matchWaitingUsers();
  }, 3000);

  this.pendingJoins.set(socketId, timer);
}

private matchWaitingUsers(): void {
  if (this.queue.size() < 2) {
    console.log("NO PAIR FOUND");
    return;
  }

  const waitingUsers: User[] = [];

  while (this.queue.size() > 0) {
    const user = this.queue.dequeue();
    if (user && this.connectedUsers.has(user.id)) {
      waitingUsers.push(user);
    }
  }

  if (waitingUsers.length < 2) {
    waitingUsers.forEach((user) => this.queue.enqueue(user));
    return;
  }

  // Keep the longest-waiting connected user first.
  const user1 = waitingUsers[0];
  const candidates = waitingUsers.slice(1);
  const freshCandidates = candidates.filter(
    (candidate) => !this.hasRecentlyMatched(user1.id, candidate.id)
  );
  const availableCandidates =
    freshCandidates.length > 0 ? freshCandidates : candidates;
  const randomIndex = Math.floor(Math.random() * availableCandidates.length);
  const user2 = availableCandidates[randomIndex];

  const selectedIds = new Set([user1.id, user2.id]);
  waitingUsers
    .filter((user) => !selectedIds.has(user.id))
    .forEach((user) => this.queue.enqueue(user));

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
        this.cancelPendingJoin(socketId);
        const itemToRemove = this.queue.find(socketId);
        if (itemToRemove) {
            this.queue.remove(itemToRemove);
            console.log(`Removed item with id ${socketId}.`);
        }
        this.rooms.forEach((room , roomId)=>{
            console.log("ROOM ::  " , roomId , "USER1 :: ", room.user1.id , "  USER2 :: " , room.user2.id)
            if(room.user1.id==socketId || room.user2.id == socketId){
                this.rooms.delete(roomId)
                console.log("DELETING ROOM :: " , roomId)
                this.io.to(room.user1.id).to(room?.user2.id).emit("leaveRoom")
            }
        })

        if (this.connectedUsers.delete(socketId)) {
            this.emitOnlineCount();
        }
    }

    handleLeaveRoom(socketId:string){
        console.log("LEAVING REQUEST FROM :: " , socketId)
        this.cancelPendingJoin(socketId);
        const itemToRemove = this.queue.find(socketId);
        if (itemToRemove) {
            this.queue.remove(itemToRemove);
        }

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


