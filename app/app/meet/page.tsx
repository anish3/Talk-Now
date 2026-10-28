
"use client";

import React, { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import Link from "next/link";
import configuration from "../config/config";

interface Message {
  from: "host" | "remote";
  message: string;
}

type ConnectionState =
  | "idle"
  | "searching"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

const connectionStateContent: Record<
  ConnectionState,
  { label: string; description: string }
> = {
  idle: {
    label: "Ready when you are",
    description: "Allow camera and microphone access to start searching.",
  },
  searching: {
    label: "Looking for someone",
    description: "We’ll connect you as soon as a real person is available.",
  },
  connecting: {
    label: "Match found",
    description: "Establishing a secure peer-to-peer connection.",
  },
  connected: {
    label: "You’re connected",
    description: "Say hello and enjoy the conversation.",
  },
  disconnected: {
    label: "Connection interrupted",
    description: "The connection was interrupted. You can search again.",
  },
  failed: {
    label: "Connection unavailable",
    description: "We couldn’t complete the connection. Please try again.",
  },
};

const Page = () => {
  const [messageText, setMessageText] = useState("");
  const [userCount, setUserCount] = useState("—");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reConnect, setReConnect] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [hasRoom, setHasRoom] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleSend = (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedMessage = messageText.trim();

    if (!socketRef.current || !roomIdRef.current || !trimmedMessage) {
      return;
    }

    socketRef.current.emit("message", roomIdRef.current, trimmedMessage);
    setMessages((prev) => [
      ...prev,
      { from: "host", message: trimmedMessage },
    ]);
    setMessageText("");
  };

  const socketRef = useRef<Socket | null>(null);
  const roomIdRef = useRef("");

  const handleSkip = () => {
    if (!socketRef.current || !roomIdRef.current) {
      return;
    }

    setConnectionState("searching");
    setHasRoom(false);
    setMessages([]);
    setMessageText("");
    socketRef.current.emit("leaveRoom");
  };

  const handleRetry = () => {
    setConnectionState("idle");
    setConnectionError("");
    setHasRoom(false);
    setMessages([]);
    setMessageText("");
    setReConnect((prev) => !prev);
  };

  useEffect(() => {
    const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    const socketUrl =
      configuredSocketUrl ||
      (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

    if (!socketUrl) {
      console.error("NEXT_PUBLIC_SOCKET_URL is missing.");
      setConnectionError(
        "The chat server URL is not configured. Set NEXT_PUBLIC_SOCKET_URL and reload."
      );
      setConnectionState("failed");
      return;
    }

    setConnectionState("idle");
    setConnectionError("");
    setHasRoom(false);

    const socket = io(socketUrl);
    socketRef.current = socket;

    const peerConnection = new RTCPeerConnection(configuration);
    const pendingIceCandidates: RTCIceCandidateInit[] = [];
    const remoteStream = new MediaStream();

    let disposed = false;
    let attemptActive = true;
    let mediaReady = false;
    let joinSent = false;
    let localStream: MediaStream | null = null;
    let makingOffer = false;

    const detachRemoteMedia = () => {
      if (remoteVideoRef.current?.srcObject === remoteStream) {
        remoteVideoRef.current.srcObject = null;
      }

      remoteStream.getTracks().forEach((track) => {
        remoteStream.removeTrack(track);
      });
    };

    const closePeerConnection = () => {
      detachRemoteMedia();

      if (peerConnection.signalingState !== "closed") {
        peerConnection.close();
      }
    };

    const invalidateAttempt = () => {
      attemptActive = false;
      mediaReady = false;
      closePeerConnection();
    };

    const isCurrentEffect = () =>
      !disposed && socketRef.current === socket;

    const ownsActiveAttempt = () =>
      isCurrentEffect() &&
      attemptActive &&
      peerConnection.signalingState !== "closed";

    const tryStartSearching = () => {
      if (
        !ownsActiveAttempt() ||
        !mediaReady ||
        joinSent ||
        !socket.connected
      ) {
        return;
      }

      joinSent = true;
      setConnectionState("searching");
      socket.emit("join");
    };

    const flushPendingIceCandidates = async () => {
      if (!ownsActiveAttempt() || !peerConnection.remoteDescription) return;

      while (pendingIceCandidates.length > 0) {
        if (!ownsActiveAttempt()) return;

        const candidate = pendingIceCandidates.shift();

        if (!candidate) continue;

        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );

          if (!ownsActiveAttempt()) return;

          console.log("QUEUED ICE CANDIDATE ADDED");
        } catch (error) {
          console.error("Error adding queued ICE candidate:", error);
        }
      }
    };

    const attachRemoteStream = async () => {
      const video = remoteVideoRef.current;
      if (!video || !ownsActiveAttempt()) return;

      video.srcObject = remoteStream;

      try {
        await video.play();

        if (!ownsActiveAttempt()) return;

        console.log("REMOTE VIDEO PLAYING");
      } catch (error) {
        console.warn("Remote video playback did not start:", error);
      }
    };

    const handleTrack = async (event: RTCTrackEvent) => {
  if (!ownsActiveAttempt()) return;

  const track = event.track;

  console.log("REMOTE TRACK RECEIVED", {
    kind: track.kind,
    readyState: track.readyState,
    muted: track.muted,
    streams: event.streams.length,
  });

  // Prefer the stream supplied by WebRTC.
  if (event.streams.length > 0) {
    const incomingStream = event.streams[0];
    const video = remoteVideoRef.current;

    if (video && ownsActiveAttempt()) {
      if (video.srcObject !== incomingStream) {
        video.srcObject = incomingStream;
      }

      try {
        await video.play();

        if (!ownsActiveAttempt()) return;

        console.log("REMOTE VIDEO PLAYING");
      } catch (error) {
        console.warn("Remote playback failed:", error);
      }
    }
  } else {
    // Some peers provide a track without an associated stream.
    if (!ownsActiveAttempt()) return;

    if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
      remoteStream.addTrack(track);
    }

    await attachRemoteStream();
    if (!ownsActiveAttempt()) return;
  }

  track.onunmute = () => {
    if (!ownsActiveAttempt()) return;

    console.log("REMOTE TRACK UNMUTED", {
      kind: track.kind,
      readyState: track.readyState,
    });
  };
};

    const handleIceCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!event.candidate || !ownsActiveAttempt()) return;

      const roomId = roomIdRef.current;

      if (!roomId) {
        console.warn("ICE candidate generated before room assignment.");
        return;
      }

      socket.emit("ice-candidates", roomId, event.candidate.toJSON());
    };

    const createOffer = async () => {
      if (!roomIdRef.current || makingOffer || !ownsActiveAttempt()) return;

      try {
        makingOffer = true;

        const offer = await peerConnection.createOffer();
        if (!ownsActiveAttempt()) return;

        await peerConnection.setLocalDescription(offer);
        if (!ownsActiveAttempt() || !roomIdRef.current) return;

        socket.emit("offer", roomIdRef.current, peerConnection.localDescription);
        console.log("OFFER SENT");
      } catch (error) {
        console.error("Error creating offer:", error);
        if (ownsActiveAttempt()) {
          setConnectionState("failed");
        }
      } finally {
        makingOffer = false;
      }
    };

    const sendAnswer = async () => {
      if (!roomIdRef.current || !ownsActiveAttempt()) return;

      try {
        const answer = await peerConnection.createAnswer();
        if (!ownsActiveAttempt()) return;

        await peerConnection.setLocalDescription(answer);
        if (!ownsActiveAttempt() || !roomIdRef.current) return;

        socket.emit("answer", roomIdRef.current, peerConnection.localDescription);
        console.log("ANSWER SENT");
      } catch (error) {
        console.error("Error creating answer:", error);
        if (ownsActiveAttempt()) {
          setConnectionState("failed");
        }
      }
    };

    const handleJoined = ({ room }: { room: string }) => {
      if (!ownsActiveAttempt() || !socket.connected) return;

      roomIdRef.current = room;
      setHasRoom(true);
      setConnectionState("connecting");
      console.log("JOINED ROOM:", room);
      console.log("SOCKET ID:", socket.id);
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      if (!ownsActiveAttempt()) return;

      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        if (!ownsActiveAttempt()) return;

        console.log("REMOTE ANSWER SET");
        await flushPendingIceCandidates();
        if (!ownsActiveAttempt()) return;
      } catch (error) {
        console.error("Error setting remote answer:", error);
        if (ownsActiveAttempt()) {
          setConnectionState("failed");
        }
      }
    };

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      if (!ownsActiveAttempt()) return;

      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        if (!ownsActiveAttempt()) return;

        console.log("REMOTE OFFER SET");
        await flushPendingIceCandidates();
        if (!ownsActiveAttempt()) return;

        await sendAnswer();
        if (!ownsActiveAttempt()) return;
      } catch (error) {
        console.error("Error handling remote offer:", error);
        if (ownsActiveAttempt()) {
          setConnectionState("failed");
        }
      }
    };

    const handleIncomingIce = async (candidate: RTCIceCandidateInit) => {
      if (!ownsActiveAttempt()) return;

      try {
        if (!peerConnection.remoteDescription) {
          pendingIceCandidates.push(candidate);
          console.log("ICE CANDIDATE QUEUED");
          return;
        }

        await peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );

        if (!ownsActiveAttempt()) return;

        console.log("ICE CANDIDATE ADDED");
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
        if (ownsActiveAttempt()) {
          setConnectionState("failed");
        }
      }
    };

    const handleLeaveRoom = () => {
      if (!isCurrentEffect()) return;

      roomIdRef.current = "";
      setHasRoom(false);
      setMessages([]);
      setMessageText("");

      invalidateAttempt();

      console.log("LEFT ROOM");
      setConnectionState("searching");
      setReConnect((prev) => !prev);
    };

    const handleMessage = (msg: string) => {
      if (!ownsActiveAttempt()) return;

      setMessages((prev) => [
        ...prev,
        { from: "remote", message: msg },
      ]);
    };

    const handleUserCount = (count: number) => {
      if (!isCurrentEffect()) return;

      setUserCount(String(count));
    };

    const handleConnectionState = () => {
      const state = peerConnection.connectionState;

      console.log("PEER CONNECTION STATE:", state);
      console.log("ICE CONNECTION STATE:", peerConnection.iceConnectionState);
      console.log("ICE GATHERING STATE:", peerConnection.iceGatheringState);
      console.log("SIGNALING STATE:", peerConnection.signalingState);

      if (!ownsActiveAttempt()) return;

      if (state === "connected") {
        setConnectionError("");
        setConnectionState("connected");
      } else if (state === "disconnected") {
        setConnectionState("disconnected");
      } else if (state === "failed") {
        invalidateAttempt();
        setConnectionState("failed");
      }
    };

    const handleSocketDisconnect = () => {
      if (!isCurrentEffect()) return;

      roomIdRef.current = "";
      setHasRoom(false);
      setMessages([]);
      setMessageText("");
      invalidateAttempt();
      setConnectionState("disconnected");
    };

    const handleSocketError = (error: Error) => {
      console.error("Socket connection error:", error);
      if (isCurrentEffect()) {
        invalidateAttempt();
        setConnectionError(
          `The chat server could not be reached${error.message ? `: ${error.message}` : "."}`
        );
        setConnectionState("failed");
      }
    };

    const handleSocketConnect = () => {
      if (!isCurrentEffect()) return;

      if (!attemptActive) {
        setReConnect((prev) => !prev);
        return;
      }

      tryStartSearching();
    };

    peerConnection.addEventListener("track", handleTrack);
    peerConnection.addEventListener("icecandidate", handleIceCandidate);
    peerConnection.addEventListener("connectionstatechange", handleConnectionState);
    peerConnection.addEventListener("iceconnectionstatechange", handleConnectionState);

    socket.on("connect", handleSocketConnect);
    socket.on("joined", handleJoined);
    socket.on("answer", handleAnswer);
    socket.on("offer", handleOffer);
    socket.on("send-offer", createOffer);
    socket.on("ice-candidates", handleIncomingIce);
    socket.on("leaveRoom", handleLeaveRoom);
    socket.on("message", handleMessage);
    socket.on("user-count", handleUserCount);
    socket.on("disconnect", handleSocketDisconnect);
    socket.on("connect_error", handleSocketError);

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

        if (disposed || !attemptActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStream = stream;
        mediaReady = true;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });

        console.log("LOCAL CAMERA AND MICROPHONE READY");
        tryStartSearching();
      } catch (error) {
        console.error("Error accessing camera or microphone:", error);
        if (!disposed && attemptActive) {
          invalidateAttempt();
          setConnectionError(
            "Camera and microphone could not be initialized. Check browser permissions and device availability, then try again."
          );
          setConnectionState("failed");
        }
      }
    };

    start();

    return () => {
      disposed = true;
      attemptActive = false;
      mediaReady = false;
      roomIdRef.current = "";

      socket.removeAllListeners();
      socket.disconnect();

      peerConnection.removeEventListener("track", handleTrack);
      peerConnection.removeEventListener("icecandidate", handleIceCandidate);
      peerConnection.removeEventListener("connectionstatechange", handleConnectionState);
      peerConnection.removeEventListener("iceconnectionstatechange", handleConnectionState);

      closePeerConnection();

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      if (localVideoRef.current?.srcObject === localStream) {
        localVideoRef.current.srcObject = null;
      }

      socketRef.current = null;
      console.log("CLEANUP COMPLETE");
    };
  }, [reConnect]);

  useEffect(() => {
    if (messages.length === 0) {
      shouldAutoScrollRef.current = true;
      return;
    }

    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleChatScroll = () => {
    const container = chatScrollRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  };

  const stateContent = connectionStateContent[connectionState];
  const isSearching = connectionState === "searching";
  const isConnecting = connectionState === "connecting";
  const canSendMessage = connectionState === "connected" && hasRoom;

  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden bg-[#070914] text-white">
      <div className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute left-[-14rem] top-[-20rem] -z-10 h-[38rem] w-[38rem] rounded-full bg-fuchsia-600/15 blur-[130px]" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[-12rem] top-[24rem] -z-10 h-[34rem] w-[34rem] rounded-full bg-blue-600/15 blur-[130px]" />

        <header className="border-b border-white/10 bg-[#080a17]/80 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" aria-label="Back to Talk-Now home" className="group flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-4 focus-visible:ring-offset-[#080a17]">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] shadow-[0_0_30px_rgba(129,92,246,0.2)] transition group-hover:border-fuchsia-300/50 group-hover:bg-fuchsia-300/10">
                <span className="h-3 w-3 rounded-full bg-gradient-to-br from-fuchsia-300 to-blue-400 shadow-[0_0_16px_rgba(217,70,239,0.9)]" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white sm:text-xl">Talk-Now</span>
            </Link>
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="hidden items-center gap-2 text-xs font-medium text-slate-400 sm:flex">
                <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.8)]" />
                {userCount} online
              </div>
              <Link href="/" className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:bg-white/[0.1] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080a17]">Home</Link>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col justify-start px-4 py-6 sm:px-6 sm:py-8 lg:justify-center lg:px-8 lg:py-10">
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Talk-Now room</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Your next conversation starts here.</h1>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-300 shadow-lg shadow-black/10" aria-live="polite">
              <span className={`h-2 w-2 rounded-full ${connectionState === "connected" ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.85)]" : "bg-fuchsia-300 shadow-[0_0_12px_rgba(232,121,249,0.75)]"}`} />
              {stateContent.label}
            </div>
          </header>

          <div className="grid min-h-0 gap-5 lg:h-[30rem] lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
            <section className="grid min-h-0 min-w-0 gap-5 sm:grid-cols-2" aria-label="Video conversation">
              <div className="relative aspect-video min-h-0 min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#11162a] shadow-2xl shadow-black/25 sm:aspect-auto sm:min-h-[26rem] lg:min-h-[30rem]">
                <video
                  id="remoteVideo"
                  ref={remoteVideoRef}
                  className="h-full w-full !object-cover"
                  autoPlay
                  playsInline
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 pb-10 pt-4">
                  <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">Stranger</span>
                  <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 backdrop-blur-md">Remote video</span>
                </div>

                {connectionState !== "connected" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#080a17]/75 px-6 text-center backdrop-blur-md">
                    <div className="flex max-w-sm flex-col items-center">
                      {isSearching || isConnecting ? (
                        <div className="searching-orb mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-fuchsia-300/40 bg-fuchsia-400/10">
                          <div className="flex items-center gap-1.5">
                            <span className="searching-dot h-2.5 w-2.5 rounded-full bg-fuchsia-300" />
                            <span className="searching-dot searching-dot-delay-1 h-2.5 w-2.5 rounded-full bg-fuchsia-300" />
                            <span className="searching-dot searching-dot-delay-2 h-2.5 w-2.5 rounded-full bg-fuchsia-300" />
                          </div>
                        </div>
                      ) : (
                        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl text-fuchsia-200">!</div>
                      )}
                      <p className="text-lg font-semibold text-white">{stateContent.label}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{connectionError || stateContent.description}</p>
                      {(connectionState === "failed" || connectionState === "disconnected") && (
                        <button type="button" className="mt-5 rounded-full bg-gradient-to-r from-fuchsia-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-fuchsia-950/30 transition hover:-translate-y-0.5 hover:shadow-fuchsia-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080a17]" onClick={handleRetry}>Search again</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative aspect-video min-h-0 min-w-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#11162a] shadow-2xl shadow-black/25 sm:aspect-auto sm:min-h-[26rem] lg:min-h-[30rem]">
                <video
                  id="localVideo"
                  ref={localVideoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-10">
                  <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">You</span>
                  <span className="text-xs text-slate-300">Camera preview</span>
                </div>
              </div>
            </section>

            <section className="flex min-h-[25rem] max-h-[34rem] min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/25 backdrop-blur-xl lg:h-full lg:min-h-0" aria-label="Text chat">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-sm font-semibold text-white">Conversation</p>
                  <p className="mt-1 text-xs text-slate-400">Your messages stay in this room.</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Text chat</span>
              </div>

              <div ref={chatScrollRef} onScroll={handleChatScroll} className="hide-scrollbar min-h-0 min-w-0 flex-grow overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[16rem] flex-col items-center justify-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-400/15 to-blue-400/15 text-fuchsia-200" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M5.25 18.25 3.5 21l4.2-1.3c.74.2 1.51.3 2.3.3h4.5c3.59 0 6.5-2.6 6.5-5.8S18.09 8.4 14.5 8.4H9.25c-3.17 0-5.75 2.2-5.75 4.9 0 1.93.99 3.67 2.75 4.95Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-300">{canSendMessage ? "Say hello when you are ready." : "Messages will appear here after you connect."}</p>
                    <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">Video and text chat unlock when a real connection is established.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`mb-4 flex ${msg.from === "host" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-lg sm:max-w-[80%] ${msg.from === "host" ? "rounded-br-md bg-gradient-to-br from-fuchsia-500 to-blue-500 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.08] text-slate-200"}`}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">{msg.from === "host" ? "You" : "Stranger"}</p>
                        <p className="break-all break-words whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-white/10 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-fuchsia-300/40 hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300" onClick={handleSkip} disabled={!hasRoom}>
                    <span aria-hidden="true">↗</span>
                    Skip stranger
                  </button>
                  <span className="text-[11px] text-slate-500">{canSendMessage ? "Connected" : "Waiting for connection"}</span>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b0e1d] p-1.5 transition focus-within:border-fuchsia-300/40 focus-within:ring-2 focus-within:ring-fuchsia-300/10">
                  <input type="text" placeholder={canSendMessage ? "Write a message..." : "Connect to start chatting"} aria-label="Message" className="min-w-0 flex-grow bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50" value={messageText} onChange={(e) => setMessageText(e.target.value)} disabled={!canSendMessage} onKeyDown={(e) => { if (e.key === "Enter") handleSend(e); }} onTouchStart={() => inputRef.current?.focus()} ref={inputRef} />
                  <button type="button" aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-blue-500 text-white shadow-lg shadow-fuchsia-950/30 transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-35 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-200" onClick={handleSend} disabled={!canSendMessage}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Page;
