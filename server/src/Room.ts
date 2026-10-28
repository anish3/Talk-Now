
import { v4 as uuidv4 } from 'uuid';
import Queue from "./Queue";
import { Server } from 'socket.io';

interface MatchPreferences {
    mood?: string;
    interests?: string[];
}

interface User {
    id: string;
    preferences?: MatchPreferences;
    queuedAt?: number;
}

interface QuestState {
    id: string;
    prompt: string;
    challenge: string;
}

interface Room {
    user1: User;
    user2: User;
    quest: QuestState | null;
    revealConsent: Record<string, boolean>;
}

const QUEST_LIBRARY: QuestState[] = [
    { id: 'q1', prompt: 'What is one small thing that made your week better?', challenge: 'Share one detail and ask your match a follow-up question.' },
    { id: 'q2', prompt: 'What is a place you would return to for a full reset?', challenge: 'Describe why it feels good to you.' },
    { id: 'q3', prompt: 'What is something you are genuinely curious about right now?', challenge: 'Trade one question and one honest answer.' },
    { id: 'q4', prompt: 'What would your ideal low-key weekend look like?', challenge: 'Compare your version with your match.' },
];

export class RoomManager {
    private rooms: Map<string, Room>;
    private io: Server;
    private queue: Queue<User>;
    private connectedUsers: Set<string>;
    private pendingJoins: Map<string, ReturnType<typeof setTimeout>>;
    private messageRateLimits: Map<string, { windowStart: number; count: number }>;
    private readonly messageRateLimit = 5;
    private readonly messageRateWindowMs = 5000;
    private readonly maxSessionDescriptionSize = 100000;
    private readonly maxIceCandidateSize = 16000;
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

    private clearRecentPartner(socketId: string): void {
        this.recentPartners.delete(socketId);

        this.recentPartners.forEach((partners, userId) => {
            const remainingPartners = partners.filter((partner) => partner !== socketId);

            if (remainingPartners.length !== partners.length) {
                this.recentPartners.set(userId, remainingPartners);
            }
        });
    }

    constructor(io: Server) {
        this.rooms = new Map<string, Room>();
        this.io = io;
        this.queue = new Queue<User>();
        this.connectedUsers = new Set<string>();
        this.pendingJoins = new Map<string, ReturnType<typeof setTimeout>>();
        this.messageRateLimits = new Map();
    }

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

    private isRoomMember(room: Room, socketId: string): boolean {
        return room.user1.id === socketId || room.user2.id === socketId;
    }

    private cancelPendingJoin(socketId: string): void {
        const timer = this.pendingJoins.get(socketId);
        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.pendingJoins.delete(socketId);
    }

    private canSendMessage(socketId: string): boolean {
        const now = Date.now();
        const current = this.messageRateLimits.get(socketId);

        if (!current || now - current.windowStart >= this.messageRateWindowMs) {
            this.messageRateLimits.set(socketId, { windowStart: now, count: 1 });
            return true;
        }

        if (current.count >= this.messageRateLimit) {
            return false;
        }

        current.count += 1;
        return true;
    }

    private clearMessageRateLimit(socketId: string): void {
        this.messageRateLimits.delete(socketId);
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }

    private isWithinPayloadSize(value: unknown, maxSize: number): boolean {
        try {
            const serialized = JSON.stringify(value);
            return typeof serialized === "string" && serialized.length <= maxSize;
        } catch {
            return false;
        }
    }

    private isValidSessionDescription(
        value: unknown,
        expectedType: "offer" | "answer"
    ): boolean {
        if (!this.isRecord(value) || !this.isWithinPayloadSize(value, this.maxSessionDescriptionSize)) {
            return false;
        }

        return (
            value.type === expectedType &&
            typeof value.sdp === "string" &&
            value.sdp.trim().length > 0 &&
            value.sdp.length <= this.maxSessionDescriptionSize
        );
    }

    private isValidIceCandidate(value: unknown): boolean {
        if (!this.isRecord(value) || !this.isWithinPayloadSize(value, this.maxIceCandidateSize)) {
            return false;
        }

        if (typeof value.candidate !== "string" || value.candidate.length > 8192) {
            return false;
        }

        if (
            "sdpMid" in value &&
            value.sdpMid !== null &&
            (typeof value.sdpMid !== "string" || value.sdpMid.length > 256)
        ) {
            return false;
        }

        if (
            "sdpMLineIndex" in value &&
            value.sdpMLineIndex !== null &&
            (typeof value.sdpMLineIndex !== "number" ||
                !Number.isInteger(value.sdpMLineIndex) ||
                value.sdpMLineIndex < 0)
        ) {
            return false;
        }

        if (
            "usernameFragment" in value &&
            value.usernameFragment !== null &&
            (typeof value.usernameFragment !== "string" || value.usernameFragment.length > 256)
        ) {
            return false;
        }

        return true;
    }

    normalizePreferences(value: unknown): MatchPreferences | undefined {
        if (!value || typeof value !== 'object') {
            return undefined;
        }

        const record = value as Record<string, unknown>;
        const mood = typeof record.mood === 'string' ? record.mood.trim() : undefined;
        const availableInterests = Array.isArray(record.interests)
            ? record.interests.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
            : [];

        if (!mood && availableInterests.length === 0) {
            return undefined;
        }

        return {
            mood: mood && mood.length > 0 ? mood : undefined,
            interests: availableInterests.length > 0 ? availableInterests.slice(0, 5) : undefined,
        };
    }

    private areCompatiblePreferences(userA?: MatchPreferences, userB?: MatchPreferences): boolean {
        if (!userA && !userB) {
            return true;
        }

        if (!userA || !userB) {
            return true;
        }

        const moodMatch = !!userA.mood && !!userB.mood && userA.mood.toLowerCase() === userB.mood.toLowerCase();
        const interestOverlap = (userA.interests ?? []).some((item) => (userB.interests ?? []).includes(item));
        const directStringMatch = (userA.interests ?? []).some((item) => (userB.interests ?? []).includes(item));

        return moodMatch || interestOverlap || directStringMatch;
    }

    private getQuestTemplate(): QuestState {
        const index = Math.floor(Math.random() * QUEST_LIBRARY.length);
        return { ...QUEST_LIBRARY[index] };
    }

    private emitQuest(room: Room): void {
        if (!room.quest) {
            room.quest = this.getQuestTemplate();
        }

        this.io.to(room.user1.id).to(room.user2.id).emit('quest', {
            roomId: this.findRoomId(room),
            prompt: room.quest.prompt,
            challenge: room.quest.challenge,
            id: room.quest.id,
        });
    }

    private syncRevealState(room: Room): void {
        const consent = {
            [room.user1.id]: Boolean(room.revealConsent[room.user1.id]),
            [room.user2.id]: Boolean(room.revealConsent[room.user2.id]),
        };
        const active = consent[room.user1.id] && consent[room.user2.id];

        this.io.to(room.user1.id).to(room.user2.id).emit('reveal-state', {
            roomId: this.findRoomId(room),
            consent,
            active,
            enabled: true,
        });
    }

    private findRoomId(room: Room): string {
        for (const [roomId, candidate] of this.rooms.entries()) {
            if (candidate === room) {
                return roomId;
            }
        }

        return '';
    }

    private clearRoomBySocket(socketId: string): void {
        this.rooms.forEach((room, roomId) => {
            if (room.user1.id === socketId || room.user2.id === socketId) {
                this.rooms.delete(roomId);
                this.io.to(room.user1.id).to(room.user2.id).emit('leaveRoom');
                this.io.to(room.user1.id).to(room.user2.id).emit('quest', {
                    roomId,
                    prompt: '',
                    challenge: '',
                    id: 'reset',
                    reset: true,
                });
                this.io.to(room.user1.id).to(room.user2.id).emit('reveal-state', {
                    roomId,
                    consent: {
                        [room.user1.id]: false,
                        [room.user2.id]: false,
                    },
                    active: false,
                    enabled: false,
                    reset: true,
                });
            }
        });
    }

    createRoom(user1: User, user2: User): string {
        const roomId = uuidv4();
        const room: Room = {
            user1,
            user2,
            quest: this.getQuestTemplate(),
            revealConsent: {
                [user1.id]: false,
                [user2.id]: false,
            },
        };

        this.rooms.set(roomId, room);
        this.emitQuest(room);
        this.syncRevealState(room);
        return roomId;
    }

    addUser(socketId: string, preferences?: MatchPreferences): void {
        const normalizedPreferences = this.normalizePreferences(preferences);

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

            this.queue.enqueue({ id: socketId, preferences: normalizedPreferences, queuedAt: Date.now() });
            console.log('PLAYERS IN QUEUE ->', this.queue.size());
            this.matchWaitingUsers();
        }, 3000);

        this.pendingJoins.set(socketId, timer);
    }

    private matchWaitingUsers(): void {
        if (this.queue.size() < 2) {
            console.log('NO PAIR FOUND');
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

        const user1 = waitingUsers[0];
        const candidates = waitingUsers.slice(1);
        const compatibleCandidates = candidates.filter((candidate) =>
            this.areCompatiblePreferences(user1.preferences, candidate.preferences)
        );
        const preferredCandidates = compatibleCandidates.length > 0 ? compatibleCandidates : candidates;
        const randomIndex = Math.floor(Math.random() * preferredCandidates.length);
        const user2 = preferredCandidates[randomIndex];

        const selectedIds = new Set([user1.id, user2.id]);
        waitingUsers
            .filter((user) => !selectedIds.has(user.id))
            .forEach((user) => this.queue.enqueue(user));

        this.rememberMatch(user1.id, user2.id);
        console.log(':: Random pair found ::', user1.id, user2.id);

        const roomId = this.createRoom(user1, user2);
        this.io.to(user1.id).to(user2.id).emit('joined', { room: roomId });
        this.io.to(user1.id).emit('send-offer');
        console.log('sent offer request to ::', user1.id);
    }

    handleOffer(socketId: string, roomId: string, offer: any): void {
        console.log('OFFER SENT BY :: ', socketId, ' FOR ROOM :: ', roomId);

        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId)) return;
        if (!this.isValidSessionDescription(offer, 'offer')) return;
        const receiver = room.user1.id === socketId ? room.user2.id : room.user1.id;
        console.log('SENDING OFFER TO :: ', receiver);
        this.io.to(receiver).emit('offer', offer);
    }

    handleAnswer(socketId: string, roomId: string, offer: any): void {
        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId)) return;
        if (!this.isValidSessionDescription(offer, 'answer')) return;
        const receiver = room.user1.id === socketId ? room.user2.id : room.user1.id;
        console.log('RECIEVED ANSWER SENDING TO :: ', receiver);
        this.io.to(receiver).emit('answer', offer);
    }

    handleIceCandidates(socketId: string, roomId: string, iceCandidates: any): void {
        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId)) return;
        if (!this.isValidIceCandidate(iceCandidates)) return;

        const receiver = room.user1.id === socketId ? room.user2.id : room.user1.id;
        this.io.to(receiver).emit('ice-candidates', iceCandidates);
    }

    handleDisconnect(socketId: string): void {
        console.log('DISCONNECTED :: ', socketId);
        this.clearMessageRateLimit(socketId);
        this.clearRecentPartner(socketId);
        this.cancelPendingJoin(socketId);

        const itemToRemove = this.queue.find(socketId);
        if (itemToRemove) {
            this.queue.remove(itemToRemove);
            console.log(`Removed item with id ${socketId}.`);
        }

        this.clearRoomBySocket(socketId);

        if (this.connectedUsers.delete(socketId)) {
            this.emitOnlineCount();
        }
    }

    handleLeaveRoom(socketId: string): void {
        console.log('LEAVING REQUEST FROM :: ', socketId);
        this.clearMessageRateLimit(socketId);
        this.cancelPendingJoin(socketId);

        const itemToRemove = this.queue.find(socketId);
        if (itemToRemove) {
            this.queue.remove(itemToRemove);
        }

        this.clearRoomBySocket(socketId);
    }

    handleMessage(roomId: string, socketId: string, message: string): void {
        console.log('MESSAGE RECIEVED IN :: ', roomId);
        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId)) return;

        if (typeof message !== 'string') return;
        const trimmedMessage = message.trim();
        if (!trimmedMessage || trimmedMessage.length > 1000) return;
        if (!this.canSendMessage(socketId)) return;

        const receiver = room.user1.id === socketId ? room.user2.id : room.user1.id;
        this.io.to(receiver).emit('message', trimmedMessage);
    }

    handleQuestUpdate(socketId: string, roomId: string, quest: unknown): void {
        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId)) return;
        if (!this.isRecord(quest)) return;

        const prompt = typeof quest.prompt === 'string' ? quest.prompt.trim() : '';
        const challenge = typeof quest.challenge === 'string' ? quest.challenge.trim() : '';

        if (!prompt || !challenge || prompt.length > 180 || challenge.length > 180) {
            return;
        }

        room.quest = {
            id: typeof quest.id === 'string' && quest.id ? quest.id : `quest-${Date.now()}`,
            prompt,
            challenge,
        };

        this.io.to(room.user1.id).to(room.user2.id).emit('quest', {
            roomId,
            prompt: room.quest.prompt,
            challenge: room.quest.challenge,
            id: room.quest.id,
        });
    }

    handleRevealConsent(socketId: string, roomId: string, consent: unknown): void {
        const room = this.rooms.get(roomId);
        if (!room || !this.isRoomMember(room, socketId) || typeof consent !== 'boolean') return;

        if (!consent) {
            room.revealConsent[room.user1.id] = false;
            room.revealConsent[room.user2.id] = false;
        } else {
            room.revealConsent[socketId] = true;
        }

        this.syncRevealState(room);
    }
}
