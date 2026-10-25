# Phase 2 Server Lifecycle and Online Count

## Counting definition

The `user-count` value means the number of unique Socket.IO socket IDs that are
currently connected to this server process. It includes users who are waiting
for a match and users who are in a room. It does not mean queue length, room
count, or the number of users who have completed camera permission.

The count is updated immediately when a Socket.IO connection is registered and
when that socket is removed. Registration and removal are idempotent, so a
duplicate join, duplicate disconnect callback, or delayed matchmaking timer
cannot increment or decrement the count more than once.

## Lifecycle rules

- `handleConnect(socketId)` registers a connected socket and broadcasts the
  current count.
- `addUser(socketId)` schedules one delayed matchmaking request. Repeated
  `join` events from the same socket do not create additional timers.
- A delayed join is ignored if the socket disconnected, entered a queue, or
  entered a room before the timer completed.
- The queue belongs to `RoomManager`, so separate manager instances do not
  share users accidentally.
- `handleLeaveRoom(socketId)` cancels pending matchmaking and removes a queued
  user before deleting any room involving that socket.
- `handleDisconnect(socketId)` cancels pending matchmaking, removes the socket
  from the queue and any room, then removes it from the connected registry.
- Existing event names and payloads remain unchanged.

## Deliberate non-goals

This phase does not change the frontend, Socket.IO event names, WebRTC
offer/answer/ICE handlers, room authorization, persistence, or deployment
topology. The count remains process-local because the project does not use a
database or a multi-server adapter.

