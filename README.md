# OmeLive - A p2p based Omegle Clone

## Overview - [liveLink](https://omelive.vercel.app)

OMELIVE is a real-time, peer-to-peer (P2P) video chat application inspired by Omegle. It enables anonymous video chat sessions between users. OmeLive uses WebRTC technology to establish direct video and audio connections between users, minimizing latency and ensuring secure communication. The application relies on a signaling server for the initial connection setup.
## STUN AND TURN SERVERS
For OmeLive to function effectively, especially behind restrictive NATs or firewalls, configure a TURN server. STUN alone cannot relay media when both users are behind restrictive NATs.
### Purpose
- **STUN Servers**: Help discover public IPs and ports for establishing direct peer-to-peer connections.
- **TURN Servers**: Relay media when direct connections are blocked or unreliable.

**Note**: Configure your own STUN and TURN servers for optimal performance and security.

### Configuration
1. Create a free test account at [Metered.ca](https://www.metered.ca/stun-turn) (Open Relay).
2. In the Metered dashboard, copy the TURN URL, username, and credential into the
   `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, and
   `NEXT_PUBLIC_TURN_CREDENTIAL` variables in `app/.env.local` (or the Vercel
   project environment settings). Do not commit real credentials.
3. Set `NEXT_PUBLIC_SOCKET_URL` to the Render HTTPS service URL. Set
   `CORS_ORIGINS` in Render to the Vercel URL and local development URL,
   comma-separated. Redeploy Vercel after changing any `NEXT_PUBLIC_*` value.

## Features

- **Real-Time Video Calling**: High-quality, video and audio communication. 
- **Peer-to-Peer Connection**: Direct communication using WebRTC for low-latency, secure video chats.
- **Anonymous Matching**: Random pairing of users for spontaneous video conversations.
- **Real-Time Chatbox**: Users can chat also during video meets.
- **Anonymity**: Server doesnt persist any storage of your chats or history

## Technologies Used

- **WebRTC** : WebRTC: Enables peer-to-peer video and audio exchange for real-time video calling.
- **Socket.IO**: For transferring messages and SDP offers
- **Next.js**: React framework for building server-side rendered applications.

### Installation
```bash
   git clone https://github.com/ayushkumarTomar/OmeLive-omegleClone.git
   cd OmeLive-omegleClone
```

``` bash
# Start the frontend
cd app
npm install
npm run dev
```
```bash
# Start the server
cd ../server
npm install
npm run dev
```

Pull requests are welcome.



<div style="display: flex; justify-content: space-between;">
    <img src="https://github.com/user-attachments/assets/a26f4c50-09bb-4155-89d9-f38f831c7974" alt="Screenshot 14" style="width: 48%;">
    <img src="https://github.com/user-attachments/assets/f407e295-0af3-438d-9b53-2e716f0a771b" alt="Screenshot 12" style="width: 48%;">
</div>

