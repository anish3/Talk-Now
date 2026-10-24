
"use client";

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import AppBar from "../components/appBar";
import configuration from "../config/config";

interface Message {
  from: "host" | "remote";
  message: string;
}

const Page = () => {
  const [messageText, setMessageText] = useState("");
  const [userCount, setUserCount] = useState("🔃");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reConnect, setReConnect] = useState(false);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!socketRef.current || !roomIdRef.current || !messageText.trim()) {
      return;
    }

    socketRef.current.emit("message", roomIdRef.current, messageText);
    setMessages((prev) => [
      ...prev,
      { from: "host", message: messageText },
    ]);
    setMessageText("");
  };

  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef("");

  const handleSkip = () => {
    socketRef.current?.emit("leaveRoom");
  };

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

    if (!socketUrl) {
      console.error("NEXT_PUBLIC_SOCKET_URL is missing.");
      return;
    }

    const socket = io(socketUrl);
    socketRef.current = socket;

    const peerConnection = new RTCPeerConnection(configuration);
    const pendingIceCandidates: RTCIceCandidateInit[] = [];
    const remoteStream = new MediaStream();

    let disposed = false;
    let makingOffer = false;

    const flushPendingIceCandidates = async () => {
      if (!peerConnection.remoteDescription) return;

      while (pendingIceCandidates.length > 0) {
        const candidate = pendingIceCandidates.shift();

        if (!candidate) continue;

        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
          console.log("QUEUED ICE CANDIDATE ADDED");
        } catch (error) {
          console.error("Error adding queued ICE candidate:", error);
        }
      }
    };

    const attachRemoteStream = async () => {
      const video = remoteVideoRef.current;
      if (!video || disposed) return;

      video.srcObject = remoteStream;

      try {
        await video.play();
        console.log("REMOTE VIDEO PLAYING");
      } catch (error) {
        console.warn("Remote video playback did not start:", error);
      }
    };

    const handleTrack = async (event: RTCTrackEvent) => {
      console.log("REMOTE TRACK RECEIVED", {
        kind: event.track.kind,
        readyState: event.track.readyState,
        muted: event.track.muted,
        streams: event.streams.length,
      });

      // Use the incoming stream when the browser provides one.
      if (event.streams[0]) {
        const incomingStream = event.streams[0];

        for (const track of incomingStream.getTracks()) {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
      } else {
        if (!remoteStream.getTracks().some((t) => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
      }

      await attachRemoteStream();
    };

    const handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!event.candidate) return;

      const roomId = roomIdRef.current;

      if (!roomId) {
        console.warn("ICE candidate generated before room assignment.");
        return;
      }

      socket.emit("ice-candidates", roomId, event.candidate.toJSON());
    };

    const createOffer = async () => {
      if (!roomIdRef.current || makingOffer || disposed) return;

      try {
        makingOffer = true;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit("offer", roomIdRef.current, peerConnection.localDescription);
        console.log("OFFER SENT");
      } catch (error) {
        console.error("Error creating offer:", error);
      } finally {
        makingOffer = false;
      }
    };

    const sendAnswer = async () => {
      if (!roomIdRef.current || disposed) return;

      try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("answer", roomIdRef.current, peerConnection.localDescription);
        console.log("ANSWER SENT");
      } catch (error) {
        console.error("Error creating answer:", error);
      }
    };

    const handleJoined = ({ room }: { room: string }) => {
      roomIdRef.current = room;
      console.log("JOINED ROOM:", room);
      console.log("SOCKET ID:", socket.id);
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        console.log("REMOTE ANSWER SET");
        await flushPendingIceCandidates();
      } catch (error) {
        console.error("Error setting remote answer:", error);
      }
    };

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        console.log("REMOTE OFFER SET");
        await flushPendingIceCandidates();
        await sendAnswer();
      } catch (error) {
        console.error("Error handling remote offer:", error);
      }
    };

    const handleIncomingIce = async (candidate: RTCIceCandidateInit) => {
      try {
        if (!peerConnection.remoteDescription) {
          pendingIceCandidates.push(candidate);
          console.log("ICE CANDIDATE QUEUED");
          return;
        }

        await peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );

        console.log("ICE CANDIDATE ADDED");
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    const handleLeaveRoom = () => {
      roomIdRef.current = "";
      setMessages([]);

      remoteStream.getTracks().forEach((track) => {
        remoteStream.removeTrack(track);
      });

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      console.log("LEFT ROOM");
      setReConnect((prev) => !prev);
    };

    const handleMessage = (msg: string) => {
      setMessages((prev) => [
        ...prev,
        { from: "remote", message: msg },
      ]);
    };

    const handleUserCount = (count: string) => {
      setUserCount(count);
    };

    const handleConnectionState = () => {
      console.log("PEER CONNECTION STATE:", peerConnection.connectionState);
      console.log("ICE CONNECTION STATE:", peerConnection.iceConnectionState);
      console.log("ICE GATHERING STATE:", peerConnection.iceGatheringState);
    };

    const handleTrackMute = (event: Event) => {
      const track = event.target as MediaStreamTrack;
      console.log("REMOTE TRACK UNMUTED", {
        kind: track.kind,
        muted: track.muted,
        readyState: track.readyState,
      });
    };

    peerConnection.addEventListener("track", handleTrack);
    peerConnection.addEventListener("icecandidate", handleIceCandidate);
    peerConnection.addEventListener("connectionstatechange", handleConnectionState);
    peerConnection.addEventListener("iceconnectionstatechange", handleConnectionState);

    socket.on("joined", handleJoined);
    socket.on("answer", handleAnswer);
    socket.on("offer", handleOffer);
    socket.on("send-offer", createOffer);
    socket.on("ice-candidates", handleIncomingIce);
    socket.on("leaveRoom", handleLeaveRoom);
    socket.on("message", handleMessage);
    socket.on("user-count", handleUserCount);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1280,
            height: 720,
            facingMode: "user",
          },
          audio: true,
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        console.log("LOCAL CAMERA AND MICROPHONE READY");
        socket.emit("join");
      } catch (error) {
        console.error("Error accessing camera or microphone:", error);
      }
    };

    start();

    return () => {
      disposed = true;
      roomIdRef.current = "";

      socket.removeAllListeners();
      socket.disconnect();

      peerConnection.removeEventListener("track", handleTrack);
      peerConnection.removeEventListener("icecandidate", handleIceCandidate);
      peerConnection.removeEventListener("connectionstatechange", handleConnectionState);
      peerConnection.removeEventListener("iceconnectionstatechange", handleConnectionState);

      peerConnection.close();

      if (localVideoRef.current?.srcObject instanceof MediaStream) {
        (localVideoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
        localVideoRef.current.srcObject = null;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }

      socketRef.current = null;
      console.log("CLEANUP COMPLETE");
    };
  }, [reConnect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="bg-zinc-900 min-h-screen flex flex-col">
      <AppBar online={userCount} />

      <div className="flex-grow mt-2 mx-4 md:mx-20 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-1 md:col-span-5 flex flex-col gap-4">
          <div className="h-[45vh] bg-slate-700 rounded-3xl flex items-center justify-center overflow-hidden">
            <video
              id="remoteVideo"
              ref={remoteVideoRef}
              className="rounded-3xl w-full h-full object-cover"
              autoPlay
              playsInline
            />
          </div>

          <div className="h-[45vh] bg-slate-700 rounded-3xl flex items-center justify-center overflow-hidden">
            <video
              id="localVideo"
              ref={localVideoRef}
              className="rounded-3xl w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
          </div>
        </div>

        <div className="col-span-1 md:col-span-7 flex flex-col max-h-[90vh]">
          <div className="bg-zinc-800 h-full w-full rounded-3xl p-5 flex flex-col">
            <div
              className="flex-grow hide-scrollbar overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 200px)" }}
            >
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex my-2 ${
                    msg.from === "host" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`chat-message p-3 rounded-3xl ${
                      msg.from === "host"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex items-center mt-4">
              <button
                type="button"
                className="bg-green-500 px-4 py-2 rounded-lg cursor-pointer text-white"
                onClick={handleSkip}
              >
                <span className="sm:text-xl text-xs">SKIP</span>
              </button>

              <input
                type="text"
                placeholder="Type your message..."
                className="flex-grow ml-4 py-2 px-4 text-sm sm:text-base bg-zinc-700 text-white rounded-lg focus:outline-none"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend(e);
                }}
                onTouchStart={() => inputRef.current?.focus()}
                ref={inputRef}
              />

              <button
                type="button"
                className="ml-4 p-2 bg-blue-500 rounded-lg text-white flex items-center justify-center"
                onClick={handleSend}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-6 w-6"
                >
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
