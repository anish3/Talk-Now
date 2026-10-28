"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

type AsrStatus =
  | "idle"
  | "loading-model"
  | "ready"
  | "capturing"
  | "transcribing"
  | "complete"
  | "unsupported"
  | "error";

type TargetLanguage = "English" | "Español" | "हिन्दी";
type PocMetrics = {
  bufferDelayMs: number;
  modelLoadMs: number;
  asrMs: number;
  translationMs: number;
  totalLatencyMs: number;
  downloadedBytes?: number;
};
type QualityRow = {
  sentenceIndex: number;
  beamCount: number;
  sourceText: string;
  translatedText: string;
  translationMs: number;
};

const QUALITY_SENTENCES = [
  "Hi, how are you doing today?",
  "I am glad we matched.",
  "What do you like to do in your free time?",
  "Could you tell me about your hometown?",
  "Please give me a moment to think.",
  "That sounds really interesting.",
  "I agree with you.",
  "What was the best part of your day?",
  "Thanks for having this conversation with me.",
  "See you next time, and take care.",
];

interface RemoteAudioTranscriptionPocProps {
  stream?: MediaStream;
}

const MODEL_ID = "Xenova/whisper-tiny.en";
const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCaptureProcessor);
`;

function resample(input: Float32Array, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) {
    return input;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = sourceIndex - lower;
    output[index] = input[lower] * (1 - fraction) + input[upper] * fraction;
  }

  return output;
}

function RemoteAudioTranscriptionPoc({
  stream,
}: RemoteAudioTranscriptionPocProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const sinkRef = useRef<GainNode | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const sampleCountRef = useRef(0);
  const processingRef = useRef(false);
  const stoppedRef = useRef(false);
  const runIdRef = useRef(0);
  const frameCountRef = useRef(0);
  const [fileUrl, setFileUrl] = useState("");
  const [status, setStatus] = useState<AsrStatus>("idle");
  const [statusMessage, setStatusMessage] = useState(
    "Choose a spoken audio file or supply a remote MediaStream to begin."
  );
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage>("English");
  const [transcript, setTranscript] = useState("");
  const [translation, setTranslation] = useState("");
  const [metrics, setMetrics] = useState<PocMetrics | null>(null);
  const [warmRuns, setWarmRuns] = useState<number[]>([]);
  const [benchmarkingWarmRuns, setBenchmarkingWarmRuns] = useState(false);
  const [qualityRows, setQualityRows] = useState<QualityRow[]>([]);
  const [benchmarkingQuality, setBenchmarkingQuality] = useState(false);
  const [chunkSeconds, setChunkSeconds] = useState(5);
  const sequenceRef = useRef(0);
  const sourceTextRef = useRef("");
  const cancelWarmRunRef = useRef<(() => void) | null>(null);
  const qualityResolveRef = useRef<(() => void) | null>(null);

  const stopCapture = () => {
    stoppedRef.current = true;
    runIdRef.current += 1;
    workerRef.current?.postMessage({ type: "cancel", sequence: sequenceRef.current + 1 });
    workerRef.current?.terminate();
    workerRef.current = null;
    cancelWarmRunRef.current?.();
    cancelWarmRunRef.current = null;
    qualityResolveRef.current?.();
    qualityResolveRef.current = null;
    setBenchmarkingQuality(false);
    setBenchmarkingWarmRuns(false);
    workletRef.current?.disconnect();
    sinkRef.current?.disconnect();
    sourceRef.current?.disconnect();
    try {
      bufferSourceRef.current?.stop();
    } catch {
      // The test buffer may already have ended.
    }
    bufferSourceRef.current?.disconnect();
    workletRef.current = null;
    sinkRef.current = null;
    sourceRef.current = null;
    bufferSourceRef.current = null;
    samplesRef.current = [];
    sampleCountRef.current = 0;
    frameCountRef.current = 0;
    processingRef.current = false;
    sequenceRef.current = 0;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close();
    }
  };

  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const transcribeChunk = async (chunk: Float32Array, sampleRate: number) => {
    const runId = runIdRef.current;
    const worker = workerRef.current;
    if (processingRef.current || stoppedRef.current || !worker || chunk.length < sampleRate) {
      return;
    }

    processingRef.current = true;
    const bufferDelayMs = (chunk.length / sampleRate) * 1000;
    setStatus("transcribing");
    setStatusMessage(`Processing the fixed ${Math.round(chunk.length / sampleRate)} second sample locally…`);
    const audio = resample(chunk, sampleRate, 16000);
    if (!audio.length || !audio.some((sample) => Math.abs(sample) > 0.001)) {
      processingRef.current = false;
      setStatus("error");
      setStatusMessage("The captured PCM buffer is empty or silent.");
      return;
    }
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    worker.postMessage(
      {
        type: "process",
        sequence,
        audio,
        capturedAt: performance.now() - bufferDelayMs,
        submittedAt: performance.now(),
        audioDurationMs: bufferDelayMs,
        targetLanguage,
      },
      [audio.buffer],
    );
    if (runId !== runIdRef.current) processingRef.current = false;
  };

  const startCapture = async () => {
    stopCapture();
    stoppedRef.current = false;
    const runId = runIdRef.current;
    setTranscript("");
    setTranslation("");
    setMetrics(null);
    setWarmRuns([]);
    setQualityRows([]);
    setBenchmarkingWarmRuns(false);
    sourceTextRef.current = "";

    const audio = audioRef.current;
    if (audio) {
      if (!audio.src) {
        setStatus("error");
        setStatusMessage("Choose an audio file containing clear English speech first.");
        return;
      }
    }
    if (!("AudioContext" in window) || !("audioWorklet" in AudioContext.prototype)) {
      setStatus("unsupported");
      setStatusMessage("This browser cannot provide an isolated MediaStream audio capture path.");
      return;
    }

    try {
      const worker = new Worker(new URL("./caption.worker.ts", import.meta.url));
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data;
        if (stoppedRef.current || runId !== runIdRef.current) return;
        if (message.type === "status") {
          setStatus("loading-model");
          setStatusMessage(message.message);
          return;
        }
        if (message.type === "model-loaded") {
          setMetrics((previous) => ({
            bufferDelayMs: previous?.bufferDelayMs ?? 0,
            modelLoadMs: (previous?.modelLoadMs ?? 0) + message.loadMs,
            asrMs: previous?.asrMs ?? 0,
            translationMs: previous?.translationMs ?? 0,
            totalLatencyMs: previous?.totalLatencyMs ?? 0,
            downloadedBytes: message.downloadedBytes ?? previous?.downloadedBytes,
          }));
          return;
        }
        if (message.type === "quality-row") {
          setQualityRows((previous) => [...previous, message]);
          return;
        }
        if (message.type === "quality-complete") {
          setBenchmarkingQuality(false);
          qualityResolveRef.current?.();
          qualityResolveRef.current = null;
          return;
        }
        if (message.type === "error") {
          processingRef.current = false;
          setBenchmarkingQuality(false);
          qualityResolveRef.current?.();
          qualityResolveRef.current = null;
          setStatus("error");
          setStatusMessage(`Local benchmark failed: ${message.message}`);
          return;
        }
        if (message.type !== "result" || message.sequence !== sequenceRef.current) return;
        processingRef.current = false;
        const totalLatencyMs = performance.now() - message.capturedAt;
        setTranscript(message.sourceText);
        sourceTextRef.current = message.sourceText;
        setTranslation(message.translatedText);
        setMetrics((previous) => ({
          bufferDelayMs: message.audioDurationMs,
          modelLoadMs: previous?.modelLoadMs ?? 0,
          asrMs: message.transcriptionMs,
          translationMs: message.translationMs,
          totalLatencyMs,
          downloadedBytes: previous?.downloadedBytes,
        }));
        setStatus("complete");
        setStatusMessage("A genuine local Whisper and translation result was produced for this completed audio chunk.");
      };
      worker.onerror = (error) => {
        processingRef.current = false;
        setStatus("error");
        setStatusMessage(`Local benchmark worker failed: ${error.message}`);
      };
      worker.postMessage({ type: "load", targetLanguage });
      const context = new AudioContext();
      await context.resume();
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const workletUrl = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      let source: AudioNode;
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || audioTrack.readyState !== "live" || !audioTrack.enabled) {
          throw new Error("The supplied audio track is missing, disabled, or not live.");
        }
        const isolatedStream = new MediaStream([audioTrack]);
        source = context.createMediaStreamSource(isolatedStream);
        setStatusMessage(`Remote audio track ready (${audioTrack.kind}, ${audioTrack.readyState}).`);
      } else {
        if (!fileUrl) {
          throw new Error("Choose an audio file containing clear English speech first.");
        }
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`The selected audio file could not be read (${response.status}).`);
        }
        const audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
        const bufferSource = context.createBufferSource();
        bufferSource.buffer = audioBuffer;
        bufferSource.onended = () => {
          if (stoppedRef.current || runId !== runIdRef.current) {
            return;
          }
          if (sampleCountRef.current >= (context?.sampleRate ?? 48000)) {
            const finalChunk = new Float32Array(sampleCountRef.current);
            let offset = 0;
            for (const part of samplesRef.current) {
              finalChunk.set(part, offset);
              offset += part.length;
            }
            samplesRef.current = [];
            sampleCountRef.current = 0;
            void transcribeChunk(finalChunk, context?.sampleRate ?? 48000);
          }
          sourceRef.current?.disconnect();
          setStatusMessage("The controlled audio ended; waiting for the final local inference result.");
        };

        bufferSourceRef.current = bufferSource;
        source = bufferSource;
        setStatusMessage(`Decoded ${audioBuffer.duration.toFixed(1)} seconds of local audio into the isolated PCM path.`);
      }
      const worklet = new AudioWorkletNode(context, "pcm-capture");
      const sink = context.createGain();
      sink.gain.value = 0;
      const chunkSize = Math.round(context.sampleRate * chunkSeconds);

      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (stoppedRef.current || runId !== runIdRef.current) {
          return;
        }
        frameCountRef.current += 1;
        if (frameCountRef.current === 1) {
          setStatusMessage("AudioWorklet is receiving PCM frames; collecting a five-second segment.");
        }
        const samples = event.data;
        samplesRef.current.push(samples);
        sampleCountRef.current += samples.length;
        if (sampleCountRef.current < chunkSize) {
          return;
        }

        const chunk = new Float32Array(sampleCountRef.current);
        let offset = 0;
        for (const part of samplesRef.current) {
          chunk.set(part, offset);
          offset += part.length;
        }
        samplesRef.current = [];
        sampleCountRef.current = 0;
        void transcribeChunk(chunk, context.sampleRate);
      };
      worklet.port.onmessageerror = () => {
        setStatus("error");
        setStatusMessage("The AudioWorklet could not transfer PCM frames to the page.");
      };

      source.connect(worklet);
      // The silent sink keeps the worklet in the active audio graph without
      // playing a second copy of the controlled source.
      worklet.connect(sink);
      sink.connect(context.destination);
      if (bufferSourceRef.current) {
        bufferSourceRef.current.start();
      }
      audioContextRef.current = context;
      sourceRef.current = source;
      workletRef.current = worklet;
      sinkRef.current = sink;
      setStatus("capturing");
      setStatusMessage("AudioWorklet is receiving PCM frames; collecting a five-second segment.");
    } catch (error) {
      console.error("Unable to start isolated audio capture:", error);
      setStatus("error");
      setStatusMessage(`Audio capture failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    stopCapture();
    setTranscript("");
    setTranslation("");
    setStatus("ready");
    setStatusMessage("Audio source ready. Start the isolated local transcription test.");
    setFileUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return URL.createObjectURL(file);
    });
  };

  const runWarmTranslations = async () => {
    const worker = workerRef.current;
    const sourceText = sourceTextRef.current;
    if (!worker || !sourceText || targetLanguage === "English" || status !== "complete") {
      setStatusMessage("Complete a Hindi or Spanish benchmark first before running warm translations.");
      return;
    }

    setBenchmarkingWarmRuns(true);
    setWarmRuns([]);
    const results: number[] = [];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      if (stoppedRef.current || !workerRef.current) break;
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;
      const startedAt = performance.now();
      let cancelled = false;
      await new Promise<void>((resolve) => {
        cancelWarmRunRef.current = () => {
          cancelled = true;
          resolve();
        };

        const previousHandler = worker.onmessage;
        worker.onmessage = (event: MessageEvent) => {
          const message = event.data;
          if (message.type === "translation-result" && message.sequence === sequence) {
            const duration = performance.now() - startedAt;
            results.push(duration);
            setWarmRuns([...results]);
            setTranslation(message.translatedText);
            worker.onmessage = previousHandler;
            cancelWarmRunRef.current = null;
            resolve();
            return;
          }
          if (message.type === "error" && message.sequence === sequence) {
            worker.onmessage = previousHandler;
            cancelWarmRunRef.current = null;
            cancelled = true;
            setBenchmarkingWarmRuns(false);
            setStatus("error");
            setStatusMessage(`Warm translation failed: ${message.message}`);
            resolve();
            return;
          }
          previousHandler?.call(worker, event);
        };
        worker.postMessage({
          type: "translate",
          sequence,
          sourceText,
          targetLanguage,
          capturedAt: startedAt,
          submittedAt: startedAt,
        });
      });
      if (cancelled) break;
    }
    setBenchmarkingWarmRuns(false);
    if (results.length) {
      const sorted = [...results].sort((a, b) => a - b);
      setStatusMessage(`Warm translation benchmark complete. Median: ${Math.round(sorted[Math.floor(sorted.length / 2)])} ms.`);
    }
  };

  const runQualityBenchmark = async () => {
    const worker = workerRef.current;
    if (!worker || targetLanguage === "English" || status !== "complete") {
      setStatusMessage("Complete a Hindi or Spanish run before starting the 10-sentence quality benchmark.");
      return;
    }
    setQualityRows([]);
    setBenchmarkingQuality(true);
    await new Promise<void>((resolve) => {
      qualityResolveRef.current = resolve;
      const sequence = sequenceRef.current + 1;
      sequenceRef.current = sequence;
      worker.postMessage({
        type: "quality-benchmark",
        sequence,
        sentences: QUALITY_SENTENCES,
        targetLanguage,
      });
    });
    setStatusMessage("10-sentence beam comparison complete. Review outputs and timings below.");
  };

  return (
    <main className="royal-shell min-h-screen px-5 py-10 text-white sm:px-8">
      <div className="royal-card mx-auto max-w-3xl rounded-3xl border p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="royal-kicker text-xs font-semibold uppercase tracking-[0.2em]">
              Experimental local AI
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Remote audio transcription POC</h1>
          </div>
          <Link href="/meet" className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-200/50 hover:text-white">
            Back to room
          </Link>
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
          This isolated harness accepts a supplied remote-audio MediaStream. The file test decodes a selected
          speech recording into an isolated local PCM path. Audio is processed locally by Whisper Tiny; it is never sent to an API.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-200/15 bg-black/20 p-4">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100" htmlFor="speech-file">
            Controlled speech source
          </label>
          <input
            id="speech-file"
            className="mt-3 block w-full text-sm text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-amber-200/15 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-amber-100"
            type="file"
            accept="audio/*"
            onChange={handleFile}
          />
          {fileUrl && (
            <audio ref={audioRef} className="mt-4 w-full" controls src={fileUrl}>
              Your browser cannot play this audio source.
            </audio>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Target language
            <select
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value as TargetLanguage)}
              disabled={status === "loading-model" || status === "capturing" || status === "transcribing"}
              className="rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white"
            >
              <option value="English">English (captions only)</option>
              <option value="हिन्दी">Hindi</option>
              <option value="Español">Spanish</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Audio window
            <select
              value={chunkSeconds}
              onChange={(event) => setChunkSeconds(Number(event.target.value))}
              disabled={status === "loading-model" || status === "capturing" || status === "transcribing"}
              className="rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-white"
            >
              <option value={5}>5.0 s (POC baseline)</option>
              <option value={2}>2.0 s</option>
              <option value={1.5}>1.5 s</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void startCapture()}
            disabled={!fileUrl || status === "loading-model" || status === "capturing" || status === "transcribing"}
            className="royal-button rounded-full border px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start local transcription
          </button>
          <button
            type="button"
            onClick={() => void runWarmTranslations()}
            disabled={benchmarkingWarmRuns || targetLanguage === "English" || status !== "complete"}
            className="rounded-full border border-amber-200/30 px-5 py-2.5 text-sm font-semibold text-amber-100 transition hover:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Run 3 warm translations
          </button>
          <button
            type="button"
            onClick={() => void runQualityBenchmark()}
            disabled={benchmarkingQuality || benchmarkingWarmRuns || targetLanguage === "English" || status !== "complete"}
            className="rounded-full border border-cyan-200/30 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare beams on 10 sentences
          </button>
          <button
            type="button"
            onClick={stopCapture}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-amber-200/40 hover:text-white"
          >
            Stop
          </button>
        </div>

        <p className="mt-5 text-xs text-slate-400" aria-live="polite">
          Status: <span className="text-slate-200">{statusMessage}</span>
        </p>
        <div className="mt-5 min-h-32 rounded-2xl border border-white/10 bg-black/25 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Local transcript</p>
          <p className="mt-3 whitespace-pre-wrap text-lg leading-8 text-white">
            {transcript || "Recognized speech will appear here after a real audio segment is processed."}
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Translation</p>
          <p className="mt-2 whitespace-pre-wrap text-lg leading-8 text-white">
            {translation || "Translated output will appear here for Hindi or Spanish runs."}
          </p>
        </div>
        {process.env.NODE_ENV === "development" && metrics && (
          <p className="mt-4 text-xs text-slate-400" aria-live="polite">
            Benchmark · buffer {Math.round(metrics.bufferDelayMs)} ms · model load {Math.round(metrics.modelLoadMs)} ms ·
            ASR {Math.round(metrics.asrMs)} ms · translation {Math.round(metrics.translationMs)} ms ·
            total {Math.round(metrics.totalLatencyMs)} ms
            {metrics.downloadedBytes !== undefined && ` · downloaded ${Math.round(metrics.downloadedBytes / 1024)} KiB`}
          </p>
        )}
        {process.env.NODE_ENV === "development" && warmRuns.length > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            Warm translation runs: {warmRuns.map((value) => `${Math.round(value)} ms`).join(" · ")} · median{" "}
            {Math.round([...warmRuns].sort((a, b) => a - b)[Math.floor(warmRuns.length / 2)])} ms
          </p>
        )}
        {process.env.NODE_ENV === "development" && qualityRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-slate-300">
            <p className="font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Beam quality benchmark</p>
            <table className="mt-3 min-w-full text-left">
              <thead>
                <tr className="text-slate-500">
                  <th className="pr-3">#</th>
                  <th className="pr-3">Beams</th>
                  <th className="pr-3">Source</th>
                  <th className="pr-3">Output</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {qualityRows.map((row) => (
                  <tr key={`${row.beamCount}-${row.sentenceIndex}`} className="border-t border-white/5 align-top">
                    <td className="pr-3">{row.sentenceIndex + 1}</td>
                    <td className="pr-3">{row.beamCount}</td>
                    <td className="pr-3">{row.sourceText}</td>
                    <td className="pr-3">{row.translatedText}</td>
                    <td>{Math.round(row.translationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-5 text-xs leading-6 text-slate-500">
          Model: {MODEL_ID}. This proof of concept is not connected to the production meeting page.
          Passing the live remote stream into this component requires a separate integration decision and browser performance testing.
        </p>
      </div>
    </main>
  );
}

export default function RemoteTranscriptionPage() {
  return <RemoteAudioTranscriptionPoc />;
}
