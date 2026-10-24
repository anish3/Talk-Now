
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
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [reConnect, setReConnect] = useState<boolean>(false)
  const handleSend = (e:any) => {
     e.preventDefault();  // Prevent default form submission behavior
    e.stopPropagation(); //
    if (!roomId) return
    socket.emit("message", roomId, messageText)
    setMessages(prev => [{ from: "host", message: messageText }, ...prev])
    setMessageText("")
  }
  const handleSkip = () => {
    socket.emit("leaveRoom")
  }
  useEffect(() => {
    //@ts-ignore
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL)
    const peerConnection = new RTCPeerConnection(configuration);
   
  
const getUserMedia = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 1280,
        height: 720,
        facingMode: "user",
      },
      audio: true,
    });

    setLocalStream(stream);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    console.log("ADDED LOCAL TRACKS TO PC");
    console.log("Camera/mic ready. Joining matchmaking queue.");

    socket.emit("join");
  } catch (error) {
    console.error("Error accessing media devices:", error);
  }
};

    
const createOffer = async () => {
  try {
    if (!roomId) {
      console.log("Room ID not ready. Cannot create offer yet.");
      return;
    }

    const offer = await peerConnection.createOffer();

    await peerConnection.setLocalDescription(offer);

    console.log("CREATED OFFER SENDING TO:", roomId);

    socket.emit("offer", roomId, offer);
  } catch (error) {
    console.error("Error creating or sending offer:", error);
  }
};

   
const sendAnswer = async () => {
  try {
    if (!roomId) {
      console.error("Room ID missing. Cannot send answer.");
      return;
    }

    const answer = await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(answer);

    console.log("Sending answer to room:", roomId);

    socket.emit("answer", roomId, answer);
  } catch (error) {
    console.error("Error creating or sending answer:", error);
  }
};

    getUserMedia()
   
const handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
  if (event.candidate) {
    console.log("SENDING ICE CANDIDATE");

    if (!roomId) {
      console.warn("Room ID missing. ICE candidate not sent.");
      return;
    }

    socket.emit("ice-candidates", roomId, event.candidate);
  }
};

    
const handleTrack = (event: RTCTrackEvent) => {
  console.log("REMOTE TRACK RECEIVED");

  let newMediaStream: MediaStream;

  if (event.streams && event.streams.length > 0) {
    newMediaStream = event.streams[0];
  } else {
    newMediaStream = remoteVideoRef.current?.srcObject as MediaStream;

    if (!newMediaStream) {
      newMediaStream = new MediaStream();
    }

    const existingTrack = newMediaStream
      .getTracks()
      .find((track) => track.id === event.track.id);

    if (!existingTrack) {
      newMediaStream.addTrack(event.track);
    }
  }

  setRemoteStream(newMediaStream);

  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = newMediaStream;
  }
};

    const handleNegotiation = async (e: Event) => {
      try {
        if (!roomId) return
        console.log("NEGOTIATION NEEDED: Creating offer")
        await createOffer();
      } catch (error) {
        console.error("Error during negotiation:", error);
      }
    }
    socket.on("joined", ({ room }: { room: string }) => {
      roomId = room
      console.log("JOINED ROOM :: ", room)
      console.log("MY SOCKET ID :: ", socket.id)
    })
    socket.on("leaveRoom", () => {
      setMessages([])
      console.log("ROOM LEAVING REQUEST RECEIVED")
      setRemoteStream(null)
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
      roomId = ""
      remoteStream?.getTracks().forEach(track => track.stop());
      localStream?.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
      setLocalStream(null)
      console.log("Room Id after leave :: ", roomId)
      setReConnect(prev => !prev)
    })
    socket.on("answer", async (answer: RTCSessionDescriptionInit) => {
  try {
    console.log("ANSWER RECEIVED");

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    console.log("REMOTE ANSWER SET SUCCESSFULLY");
  } catch (error) {
    console.error("Error setting remote answer:", error);
  }
});
    socket.on("send-offer", () => {
      console.log("OFFER REQUEST RECIEVED")
      createOffer()
    })
    
socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
  try {
    console.log("OFFER RECEIVED SENDING ANSWER");

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    console.log("REMOTE DESCRIPTION SET");

    await sendAnswer();
  } catch (error) {
    console.error("Error handling remote offer:", error);
  }
});

    
const pendingIceCandidates: RTCIceCandidateInit[] = [];

const addIceCandidateSafely = async (
  iceCandidate: RTCIceCandidateInit
) => {
  try {
    if (peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(iceCandidate)
      );
      console.log("ICE CANDIDATE ADDED");
    } else {
      pendingIceCandidates.push(iceCandidate);
      console.log("ICE CANDIDATE QUEUED");
    }
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
};

socket.on(
  "ice-candidates",
  async (iceCandidate: RTCIceCandidateInit) => {
    await addIceCandidateSafely(iceCandidate);
  }
);

    socket.on("message", (msg: string) => {
      setMessages(prev => [{ from: "remote", message: msg }, ...prev])
    })
    socket.on('user-count', (count: string) => {
      setUserCount(count)
    })
    peerConnection.addEventListener('icecandidate', handleIceCandidate)
    console.log("ICE CANDIDATE EVENT LISTNER STARTED")
    peerConnection.addEventListener('track', handleTrack);
    peerConnection.addEventListener('negotiationneeded', handleNegotiation);
    return () => {
      socket.removeAllListeners()
      console.log("CLEANUP ALL LISTENERS")
      socket.disconnect()
      peerConnection.removeEventListener('icecandidate', handleIceCandidate)
      peerConnection.removeEventListener('track', handleTrack)
      peerConnection.close()
      console.log("CLOSED PEER CONNECTION ")
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
