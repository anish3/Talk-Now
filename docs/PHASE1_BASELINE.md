# Phase 1 Baseline Contract

This document records the current OmeLive communication contract before any
product or behavior changes. It is intentionally descriptive: Phase 1 does not
change matchmaking, video, chat, or signaling behavior.

## Repository safety baseline

- The application repository is `OmeLive-omegleClone`.
- Existing uncommitted and untracked files must be preserved. In particular,
  `app/app/meet/page-backup.txt` is an existing untracked file and is not part
  of this Phase 1 change.
- No dependency installation is required for this document.
- No production source file is modified by this Phase 1 change.

## Runtime architecture

- The frontend is a Next.js 14 application in `app/`.
- The backend is an Express and Socket.IO TypeScript server in `server/`.
- Matchmaking, room state, and signaling relay are in-memory and server-local.
- WebRTC media is peer-to-peer. The server relays signaling data but does not
  carry the media stream.
- Text messages are relayed through Socket.IO; they are not persisted.

## Socket.IO event contract

The current client/server event names and payloads are listed below. Payloads
are positional unless explicitly shown as an object.

| Direction | Event | Current payload | Current behavior |
|---|---|---|---|
| client -> server | `join` | none | Starts the server's delayed queue admission. |
| server -> client | `user-count` | `number` at runtime | Broadcasts the server's current global counter. The client currently stores it as a string. |
| server -> client | `joined` | `{ room: string }` | Sends the generated room ID to both matched clients. |
| server -> client | `send-offer` | none | Sent only to the first selected user; that client creates the offer. |
| client -> server | `offer` | `roomId: string, offer: RTCSessionDescriptionInit` | Relays the offer to the other room member. |
| server -> client | `offer` | `RTCSessionDescriptionInit` | Received by the second peer. |
| client -> server | `answer` | `roomId: string, offer: RTCSessionDescriptionInit` | Relays the answer to the other room member. The parameter is named `offer` in current code. |
| server -> client | `answer` | `RTCSessionDescriptionInit` | Received by the offer creator. |
| client -> server | `ice-candidates` | `roomId: string, candidate: RTCIceCandidateInit` | Relays an individual ICE candidate. |
| server -> client | `ice-candidates` | `RTCIceCandidateInit` | The current implementation sends the candidate object received from the peer. |
| client -> server | `message` | `roomId: string, message: string` | Relays a text message to the other room member. |
| server -> client | `message` | `string` | Appends the received text to the remote message list. |
| client -> server | `leaveRoom` | currently none from the client | Deletes the caller's room and emits `leaveRoom` to both room members. The server handler accepts an unused room ID parameter. |
| server -> client | `leaveRoom` | none | Clears the current room, remote media, and messages, then causes the client effect to reconnect/search again. |
| transport | `disconnect` | Socket.IO lifecycle event | The server removes the socket from the queue and any room, then broadcasts the counter. |

## Current matchmaking flow

1. The meeting page creates a Socket.IO connection and a single
   `RTCPeerConnection` for that effect instance.
2. The browser requests camera and microphone access.
3. Local media tracks are added to the peer connection.
4. After media setup, the client emits `join`.
5. The server waits three seconds inside `RoomManager.addUser`.
6. If the socket is not already in the module-level queue, the server
   increments `NUM_OF_PLAYERS`, enqueues the socket ID, and broadcasts
   `user-count`.
7. When at least two users are queued, the server removes all waiting users,
   keeps the longest-waiting user as `user1`, selects a candidate, and puts all
   unmatched users back into the queue.
8. The server creates a UUID room record, emits `joined` to both users, and
   emits `send-offer` to `user1`.
9. The client remains connected to the same Socket.IO server while signaling
   and text chat occur.
10. On `leaveRoom` or disconnect, the server deletes matching room records and
    notifies both users. The frontend toggles its reconnect state after the
    notification, causing the connection effect to be recreated.

## Current WebRTC offer/answer/ICE sequence

1. `user1` receives `send-offer`.
2. `user1` calls `createOffer`, sets the local description, and emits
   `offer(roomId, localDescription)`.
3. The server resolves the other member from the room map and emits `offer`.
4. `user2` sets the remote offer, creates an answer, sets the local
   description, and emits `answer(roomId, localDescription)`.
5. The server relays `answer` to `user1`.
6. `user1` sets the remote answer.
7. Both peers emit ICE candidates as they are generated using
   `ice-candidates(roomId, candidate.toJSON())`.
8. If a candidate arrives before a remote description exists, the receiving
   client stores it in a pending list.
9. Pending candidates are added after the remote offer or answer is set.
10. Incoming tracks are attached to the remote video element. Local tracks are
    attached to the local video element and are muted locally.

## Text chat flow

1. The local user submits a non-empty message.
2. The client immediately appends it locally as `host` and emits
   `message(roomId, text)`.
3. The server checks that the room exists, resolves the opposite member, and
   emits `message(text)` to that member.
4. The receiving client appends it as `remote`.

## Baseline risks to preserve and test later

These are recorded for future phases and are not changed here:

- The global online counter is incremented after a delay and decremented on
  every disconnect, which can make it inaccurate for early disconnects.
- The queue is module-level rather than owned by `RoomManager`.
- The server does not currently validate that the sender belongs to the room
  before relaying signaling or messages.
- The client currently has no user-facing searching, permission-error, or
  connection-state state machine.
- `leaveRoom` has a client/server payload mismatch: the client sends no room ID,
  while the server accepts and ignores one.

## Phase 1 test foundation

The repository currently has no test files and no test script in either
`app/package.json` or `server/package.json`. Adding an executable test runner
would require a dependency decision, so no test dependency or production code
was added in Phase 1.

The minimum regression checklist for a future test implementation is:

- two clients can join and receive one shared room ID;
- only a real `joined` event ends searching;
- offer, answer, and ICE candidates are relayed to the opposite peer;
- two clients can exchange text messages;
- skip notifies both clients and removes the room;
- disconnect removes the room and queue entry;
- reconnect does not create duplicate queue entries or listeners;
- online count never becomes negative and reflects the documented presence
  definition;
- camera/microphone denial produces a recoverable UI state;
- build, lint, and TypeScript checks pass.

