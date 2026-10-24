
"use client"
import React, { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import AppBar from '../components/appBar'
import configuration from '../config/config'
let socket: Socket;
let roomId: string;
interface Message {
  from: 'host' | 'remote';
  message: string;
}
const Page = () => {
  const [messageText, setMessageText] = useState<string>("")
  const [userCount, setUserCount] = useState<string>("🔃")
  const [messages, setMessages] = useState<Message[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [reConnect, setReConnect] = useState<boolean>(false)
  const [connectionStatus, setConnectionStatus] = useState("Connecting to server…")
  const handleSend = (e:any) => {
     e.preventDefault();  // Prevent default form submission behavior
    e.stopPropagation(); //
    if (!roomId) return
    socket.emit("message", roomId, messageText)
    setMessages(prev => [{ from: "host", message: messageText }, ...prev])
    setMessageText("")
  }
  const handleSkip = () => {
    socket?.emit("leaveRoom")
  }
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!socketUrl) {
      setConnectionStatus("Server URL is not configured");
      console.error("[socket] NEXT_PUBLIC_SOCKET_URL is missing");
      return;
    }

    socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });
    const peerConnection = new RTCPeerConnection(configuration);
    const pendingCandidates: RTCIceCandidateInit[] = [];
    let hasJoinedRoom = false;
    let isOfferer = false;
    let mediaError = false;

    socket.on("connect", () => {
      console.log("[socket] connected", { socketId: socket.id, transport: socket.io.engine.transport.name });
      setConnectionStatus("Waiting for a partner…");
      socket.emit("join");
    });
    socket.on("connect_error", (error) => {
      console.error("[socket] connection error", error.message);
      setConnectionStatus("Unable to reach server. Retrying…");
    });
    socket.on("disconnect", (reason) => {
      console.warn("[socket] disconnected", { reason });
      if (reason !== "io client disconnect") {
        setConnectionStatus("Connection lost. Retrying…");
      }
    });

    const getUserMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream?.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream);
        });
        console.log("[webrtc] local tracks added")
      } catch (error) {
        mediaError = true;
        setConnectionStatus("Camera/microphone permission is required");
        console.error("[webrtc] getUserMedia failed", error);
      }
    };
    const createOffer = async () => {
      if (!isOfferer || !hasJoinedRoom || !roomId || mediaError) return;
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      console.log("[webrtc] sending offer", { roomId });
      socket.emit("offer", roomId, offer)
    }
    const sendAnswer = async () => {
      if (!roomId || mediaError) return;
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log("[webrtc] sending answer", { roomId });
      socket.emit("answer", roomId, answer);
    }
    getUserMedia()
    const handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        const iceCandidate = event.candidate
        if (hasJoinedRoom && roomId) {
          console.log("[webrtc] sending ICE candidate", { roomId, type: iceCandidate.candidate.split(" ")[7] });
          socket.emit("ice-candidates", roomId, iceCandidate);
        }
      }
    }
    const handleTrack = (event: RTCTrackEvent) => {
      console.log("[webrtc] remote track received");
      const newMediaStream = event.streams[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = newMediaStream;
      setRemoteStream(newMediaStream)
      if (remoteVideoRef.current)
        remoteVideoRef.current.srcObject = newMediaStream;
      setConnectionStatus("Connected");
    }
    const handleNegotiation = async (e: Event) => {
      try {
        if (!roomId) return
        console.log("[webrtc] negotiation needed")
        await createOffer();
      } catch (error) {
        console.error("Error during negotiation:", error);
      }
    }
    socket.on("joined", ({ room }: { room: string }) => {
      roomId = room
      hasJoinedRoom = true;
      setConnectionStatus("Connecting video…");
      console.log("[match] joined room", { room, socketId: socket.id });
    })
    socket.on("leaveRoom", () => {
      setMessages([])
      console.log("[match] leave received")
      setRemoteStream(null)
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
      roomId = ""
      remoteStreamRef.current?.getTracks().forEach(track => track.stop());
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      remoteStreamRef.current = null;
      localStreamRef.current = null;
      setRemoteStream(null);
      setLocalStream(null)
      console.log("Room Id after leave :: ", roomId)
      setReConnect(prev => !prev)
    })
    socket.on("answer", (offer: RTCSessionDescriptionInit) => {
      console.log("[webrtc] answer received");
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(async () => {
        while (pendingCandidates.length) {
          await peerConnection.addIceCandidate(pendingCandidates.shift()!);
        }
      }).catch(error => console.error("[webrtc] answer handling failed", error));
    })
    socket.on("send-offer", () => {
      console.log("[webrtc] offer requested");
      isOfferer = true;
      createOffer()
    })
    socket.on('offer', (offer: RTCSessionDescriptionInit) => {
      console.log("[webrtc] offer received");
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer)).then(async () => {
        while (pendingCandidates.length) {
          await peerConnection.addIceCandidate(pendingCandidates.shift()!);
        }
        await sendAnswer();
      }).catch(error => console.error("[webrtc] offer handling failed", error));
    })
    socket.on("ice-candidates", (iceCandidate: RTCIceCandidate) => {
      console.log("[webrtc] ICE candidate received");
      if (peerConnection.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate))
          .catch(error => console.error("[webrtc] ICE candidate failed", error));
      } else {
        pendingCandidates.push(iceCandidate);
      }
    })
    socket.on("message", (msg: string) => {
      setMessages(prev => [{ from: "remote", message: msg }, ...prev])
    })
    socket.on('user-count', (count: string) => {
      setUserCount(count)
    })
    peerConnection.addEventListener("iceconnectionstatechange", () => {
      console.log("[webrtc] ICE connection state", peerConnection.iceConnectionState);
      socket.emit("webrtc-state", roomId, {
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
      });
      if (peerConnection.iceConnectionState === "failed") {
        setConnectionStatus("Video connection failed. Check TURN settings and retry.");
      }
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      console.log("[webrtc] connection state", peerConnection.connectionState);
      socket.emit("webrtc-state", roomId, {
        iceConnectionState: peerConnection.iceConnectionState,
        connectionState: peerConnection.connectionState,
      });
    });
    peerConnection.addEventListener('icecandidate', handleIceCandidate)
    console.log("ICE CANDIDATE EVENT LISTNER STARTED")
    peerConnection.addEventListener('track', handleTrack);
    peerConnection.addEventListener('negotiationneeded', handleNegotiation);
    return () => {
      socket.removeAllListeners()
      socket.disconnect()
      peerConnection.removeEventListener('icecandidate', handleIceCandidate)
      peerConnection.removeEventListener('track', handleTrack)
      peerConnection.close()
      roomId = "";
    }
  }, [reConnect]);
  const messagesEndRef = useRef(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

const focusInput = () => {
  if (inputRef.current) {
    inputRef.current.focus();
  }
};
  useEffect(() => {
    //@ts-ignore
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  return (
    <>
      <div className='bg-zinc-900 min-h-screen flex flex-col '>
        <AppBar online={userCount} />
        <div className='mx-4 md:mx-20 mt-2 flex items-center justify-between gap-3 text-sm text-white' role="status" aria-live="polite">
          <span>{connectionStatus}</span>
          {(connectionStatus.includes("Unable") || connectionStatus.includes("lost") || connectionStatus.includes("failed")) && (
            <button
              type="button"
              className="rounded-lg bg-blue-500 px-3 py-1"
              onClick={() => setReConnect(prev => !prev)}
            >
              Retry
            </button>
          )}
        </div>
  
        <div className='flex-grow mt-2 mx-4 md:mx-20 grid grid-cols-1 md:grid-cols-12 gap-6'>
          <div className='col-span-1 md:col-span-5 flex flex-col gap-4'>
            <div className='h-[100%] sm:h-[45%] bg-slate-700 rounded-3xl flex items-center justify-center overflow-hidden'>
              <video id='remoteVideo' ref={remoteVideoRef} className='rounded-3xl w-full h-full object-cover' autoPlay />
            </div>
            <div className='h-[100%] sm:h-[45%] bg-slate-700 rounded-3xl flex items-center justify-center overflow-hidden'>
              <video id='localVideo' ref={localVideoRef} className='rounded-3xl w-full h-full object-cover' autoPlay muted />
            </div>
          </div>
  
          <div className='col-span-1 md:col-span-7 flex flex-col max-h-[90vh]'>
            <div className='bg-zinc-800 h-full w-full rounded-3xl p-5 flex flex-col'>
              <div className='flex-grow hide-scrollbar' style={{ maxHeight: 'calc(100vh - 200px)' }}>
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex my-2 ${msg.from === 'host' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`chat-message p-3 rounded-3xl ${msg.from === 'host' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'
                        }`}
                    >
                      <p className={`text-sm`}>{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
  
              <div className='flex items-center mt-4'><div className='bg-green-500 px-4 py-2 rounded-lg cursor-pointer text-white' onClick={handleSkip} onTouchEnd={handleSkip}> {/* Use onTouchEnd instead of onTouchStart */}
                    <h1 className='sm:text-xl text-xs'>SKIP</h1>
              </div>

                <input
                  type='text'
                  placeholder='Type your message...'
                  className='flex-grow ml-4 py-2 px-4 text-sm sm:text-base bg-zinc-700 text-white rounded-lg focus:outline-none'
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSend(e);
                  }}
                  onTouchStart={focusInput}
                  ref={inputRef}
                />
                <button className='ml-4 p-2 bg-blue-500 rounded-lg text-white flex items-center justify-center' onClick={handleSend} onTouchEnd={handleSend}>
                  <svg
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 24 24'
                    fill='currentColor'
                    className='h-6 w-6'
                  >
                    <path d='M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z' />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
    
  
}
export default Page
