"use client";

import { useEffect, useRef } from "react";

export type CaptionTargetLanguage = "English" | "Español" | "हिन्दी";
export type CaptionProcessorStatus =
  | "off"
  | "unsupported"
  | "loading"
  | "listening"
  | "transcribing"
  | "translating"
  | "error";

export interface CaptionDiagnostics {
  sequence: number;
  audioBufferingDelayMs: number;
  captureDelayMs: number;
  transcriptionMs: number;
  translationMs: number;
  totalLatencyMs: number;
  modelLoadingMs?: number;
  modelDownloadedBytes?: number;
}

export interface CaptionUpdate {
  status: CaptionProcessorStatus;
  message: string;
  sourceText: string;
  translatedText: string;
  diagnostics?: CaptionDiagnostics;
}

interface RemoteCaptionProcessorProps {
  stream: MediaStream | null;
  enabled: boolean;
  targetLanguage: CaptionTargetLanguage;
  onUpdate: (update: CaptionUpdate) => void;
}

const WORKLET_SOURCE = `
class RemotePcmProcessor extends AudioWorkletProcessor {
  buffer = new Float32Array(2048);
  offset = 0;

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || !channel.length) return true;

    let position = 0;
    while (position < channel.length) {
      const count = Math.min(channel.length - position, this.buffer.length - this.offset);
      this.buffer.set(channel.subarray(position, position + count), this.offset);
      this.offset += count;
      position += count;
      if (this.offset === this.buffer.length) {
        const chunk = this.buffer;
        this.buffer = new Float32Array(2048);
        this.offset = 0;
        this.port.postMessage(chunk, [chunk.buffer]);
      }
    }
    return true;
  }
}
registerProcessor("remote-pcm", RemotePcmProcessor);
`;

function resample(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = position - lower;
    output[index] = input[lower] * (1 - fraction) + input[upper] * fraction;
  }
  return output;
}

function hasSpeech(samples: Float32Array) {
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += samples[index] * samples[index];
  }
  return Math.sqrt(energy / Math.max(1, samples.length)) > 0.008;
}

export default function RemoteCaptionProcessor({
  stream,
  enabled,
  targetLanguage,
  onUpdate,
}: RemoteCaptionProcessorProps) {
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      onUpdate({ status: "off", message: "Live subtitles are off.", sourceText: "", translatedText: "" });
      return;
    }

    if (!stream) {
      onUpdate({ status: "listening", message: "Waiting for a remote audio track.", sourceText: "", translatedText: "" });
      return;
    }

    if (!("AudioContext" in window) || !("audioWorklet" in AudioContext.prototype)) {
      onUpdate({ status: "unsupported", message: "This browser does not support local audio worklets.", sourceText: "", translatedText: "" });
      return;
    }

    const runId = ++runRef.current;
    let disposed = false;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let sink: GainNode | null = null;
    let processing = false;
    let activeSequence = 0;
    let modelLoadingMs: number | undefined;
    let modelDownloadedBytes: number | undefined;
    let parts: Float32Array[] = [];
    let sampleCount = 0;
    let sequence = 0;
    let lastSourceText = "";
    const chunkSeconds = 2.5;
    let worker: Worker | null = null;

    const update = (value: CaptionUpdate) => {
      if (!disposed && runRef.current === runId) onUpdate(value);
    };

    const start = async () => {
      try {
        const track = stream.getAudioTracks()[0];
        if (!track || track.readyState !== "live" || !track.enabled) {
          throw new Error("The remote audio track is not live.");
        }
        context = new AudioContext();
        await context.resume();
        const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
        await context.audioWorklet.addModule(moduleUrl);
        URL.revokeObjectURL(moduleUrl);
        source = context.createMediaStreamSource(new MediaStream([track]));
        worklet = new AudioWorkletNode(context, "remote-pcm");
        sink = context.createGain();
        sink.gain.value = 0;
        const chunkSize = Math.round(context.sampleRate * chunkSeconds);
        worker = new Worker(new URL("./caption.worker.ts", import.meta.url));
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent) => {
          const message = event.data;
          if (disposed || runRef.current !== runId) return;
          if (message.type === "status") {
            update({ status: message.status, message: message.message, sourceText: "", translatedText: "" });
            return;
          }
          if (message.type === "model-loaded") {
            modelLoadingMs = (modelLoadingMs ?? 0) + message.loadMs;
            modelDownloadedBytes = message.downloadedBytes;
            return;
          }
          if (message.type === "error") {
            if (message.sequence === undefined || message.sequence === activeSequence) {
              processing = false;
            }
            update({ status: "error", message: `Local caption processing failed: ${message.message}`, sourceText: "", translatedText: "" });
            return;
          }
          if (message.type !== "result" || message.sequence <= sequence) return;
          processing = false;
          activeSequence = 0;
          const currentSequence = message.sequence;
          sequence = currentSequence;
          if (!message.sourceText || message.sourceText === lastSourceText) return;
          lastSourceText = message.sourceText;
          update({
            status: "listening",
            message: `Local English to ${targetLanguage} captions are active.`,
            sourceText: message.sourceText,
            translatedText: message.translatedText,
            diagnostics: {
              sequence: currentSequence,
              audioBufferingDelayMs: message.audioDurationMs ?? 0,
              captureDelayMs: Math.max(0, message.submittedAt - message.capturedAt),
              transcriptionMs: message.transcriptionMs,
              translationMs: message.translationMs,
              totalLatencyMs: performance.now() - message.capturedAt,
              modelLoadingMs,
              modelDownloadedBytes,
            },
          });
        };
        worker.onerror = (error) => {
          processing = false;
          update({ status: "error", message: `Caption worker failed: ${error.message}`, sourceText: "", translatedText: "" });
        };
        worker.postMessage({ type: "load", targetLanguage });
        worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (disposed) return;
          parts.push(event.data);
          sampleCount += event.data.length;
          if (sampleCount < chunkSize) return;
          const chunk = new Float32Array(sampleCount);
          let offset = 0;
          for (const part of parts) {
            chunk.set(part, offset);
            offset += part.length;
          }
          parts = [];
          sampleCount = 0;
          if (processing || !hasSpeech(chunk) || !worker) return;
          processing = true;
          const currentSequence = sequence + 1;
          activeSequence = currentSequence;
          const audioDurationMs = (chunk.length / (context?.sampleRate ?? 48000)) * 1000;
          const capturedAt = performance.now() - audioDurationMs;
          update({ status: "transcribing", message: "Recognizing the latest remote speech in a worker…", sourceText: "", translatedText: "" });
          const audio = resample(chunk, context?.sampleRate ?? 48000, 16000);
          worker.postMessage(
            {
              type: "process",
              sequence: currentSequence,
              audio,
              capturedAt,
              submittedAt: performance.now(),
              audioDurationMs,
              targetLanguage,
            },
            [audio.buffer],
          );
        };
        source.connect(worklet);
        worklet.connect(sink);
        sink.connect(context.destination);
        update({ status: "listening", message: "Listening to the incoming remote audio locally.", sourceText: "", translatedText: "" });
      } catch (error) {
        console.error("Unable to start local remote captions:", error);
        update({ status: "error", message: `Local captions could not start: ${error instanceof Error ? error.message : String(error)}`, sourceText: "", translatedText: "" });
      }
    };

    void start();
    return () => {
      disposed = true;
      runRef.current += 1;
      worker?.postMessage({ type: "cancel", sequence: sequence + 1 });
      worker?.terminate();
      workerRef.current = null;
      worklet?.disconnect();
      sink?.disconnect();
      source?.disconnect();
      parts = [];
      sampleCount = 0;
      if (context && context.state !== "closed") void context.close();
    };
  }, [enabled, onUpdate, stream, targetLanguage]);

  return null;
}
