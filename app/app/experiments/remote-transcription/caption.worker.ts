import {
  pipeline,
  type AutomaticSpeechRecognitionPipelineType,
  type TranslationPipelineType,
} from "@xenova/transformers";

type TargetLanguage = "English" | "Español" | "हिन्दी";
type SupportedTranslationLanguage = Exclude<TargetLanguage, "English">;

interface ProcessMessage {
  type: "process";
  sequence: number;
  audio: Float32Array;
  capturedAt: number;
  submittedAt: number;
  audioDurationMs: number;
  targetLanguage: TargetLanguage;
}

interface LoadMessage {
  type: "load";
  targetLanguage: TargetLanguage;
}

interface CancelMessage {
  type: "cancel";
  sequence: number;
}

interface TranslateMessage {
  type: "translate";
  sequence: number;
  sourceText: string;
  targetLanguage: SupportedTranslationLanguage;
  capturedAt: number;
  submittedAt: number;
}

interface QualityBenchmarkMessage {
  type: "quality-benchmark";
  sequence: number;
  sentences: string[];
  targetLanguage: SupportedTranslationLanguage;
}

type WorkerMessage = ProcessMessage | LoadMessage | CancelMessage | TranslateMessage | QualityBenchmarkMessage;
type ProgressInfo = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

const ASR_MODEL = "Xenova/whisper-tiny.en";
const TRANSLATION_MODELS: Record<SupportedTranslationLanguage, string> = {
  Español: "Xenova/opus-mt-en-es",
  हिन्दी: "Xenova/opus-mt-en-hi",
};
const TRANSLATION_GENERATION_OPTIONS = { num_beams: 1 };

let transcriber: AutomaticSpeechRecognitionPipelineType | null = null;
const translators: Partial<Record<SupportedTranslationLanguage, TranslationPipelineType>> = {};
let transcriberPromise: Promise<AutomaticSpeechRecognitionPipelineType> | null = null;
const translatorPromises: Partial<Record<SupportedTranslationLanguage, Promise<TranslationPipelineType>>> = {};
let cancelledThrough = 0;
const downloadedBytes = new Map<string, number>();

const post = (message: unknown) => self.postMessage(message);

function progressCallback(info: ProgressInfo) {
  if (info.file && typeof info.loaded === "number") {
    downloadedBytes.set(info.file, Math.max(downloadedBytes.get(info.file) ?? 0, info.loaded));
  }
}

function measuredDownloadBytes() {
  const values = Array.from(downloadedBytes.values());
  return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
}

async function loadTranscriber() {
  if (transcriber) return transcriber;
  if (!transcriberPromise) {
    post({ type: "status", status: "loading", message: "Loading local English speech recognition…" });
    const startedAt = performance.now();
    transcriberPromise = pipeline("automatic-speech-recognition", ASR_MODEL, {
      progress_callback: progressCallback,
    }).then((loaded) => {
      transcriber = loaded;
      post({
        type: "model-loaded",
        model: ASR_MODEL,
        loadMs: performance.now() - startedAt,
        downloadedBytes: measuredDownloadBytes(),
      });
      return loaded;
    }).finally(() => {
      transcriberPromise = null;
    });
  }
  return transcriberPromise;
}

async function loadTranslator(language: SupportedTranslationLanguage) {
  if (translators[language]) return translators[language];
  if (!translatorPromises[language]) {
    post({ type: "status", status: "loading", message: `Loading local English to ${language} translation…` });
    const startedAt = performance.now();
    translatorPromises[language] = pipeline("translation", TRANSLATION_MODELS[language], {
      progress_callback: progressCallback,
    }).then((loaded) => {
      translators[language] = loaded;
      post({
        type: "model-loaded",
        model: TRANSLATION_MODELS[language],
        loadMs: performance.now() - startedAt,
        downloadedBytes: measuredDownloadBytes(),
      });
      return loaded;
    }).finally(() => {
      delete translatorPromises[language];
    });
  }
  return translatorPromises[language];
}

async function translateText(message: TranslateMessage) {
  const translationStartedAt = performance.now();
  const translator = await loadTranslator(message.targetLanguage);
  if (message.sequence <= cancelledThrough) return;
  const translated = await translator(message.sourceText, TRANSLATION_GENERATION_OPTIONS);
  const firstResult = Array.isArray(translated) ? translated[0] : translated;
  const candidate = Array.isArray(firstResult) ? firstResult[0] : firstResult;
  const translatedText =
    candidate && typeof candidate === "object" && "translation_text" in candidate
      ? String(candidate.translation_text).trim()
      : "";

  if (message.sequence <= cancelledThrough) return;
  post({
    type: "translation-result",
    sequence: message.sequence,
    capturedAt: message.capturedAt,
    submittedAt: message.submittedAt,
    sourceText: message.sourceText,
    translatedText,
    translationMs: performance.now() - translationStartedAt,
  });
}

async function runQualityBenchmark(message: QualityBenchmarkMessage) {
  const translator = await loadTranslator(message.targetLanguage);
  for (const beamCount of [1, 4]) {
    for (let index = 0; index < message.sentences.length; index += 1) {
      if (message.sequence <= cancelledThrough) return;
      const startedAt = performance.now();
      const output = await translator(message.sentences[index], { num_beams: beamCount });
      const firstResult = Array.isArray(output) ? output[0] : output;
      const candidate = Array.isArray(firstResult) ? firstResult[0] : firstResult;
      const translatedText =
        candidate && typeof candidate === "object" && "translation_text" in candidate
          ? String(candidate.translation_text).trim()
          : "";
      post({
        type: "quality-row",
        sequence: message.sequence,
        sentenceIndex: index,
        beamCount,
        sourceText: message.sentences[index],
        translatedText,
        translationMs: performance.now() - startedAt,
      });
    }
  }
  post({ type: "quality-complete", sequence: message.sequence });
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === "cancel") {
    cancelledThrough = Math.max(cancelledThrough, message.sequence);
    return;
  }

  try {
    if (message.type === "load") {
      await loadTranscriber();
      if (message.targetLanguage !== "English") {
        await loadTranslator(message.targetLanguage);
      }
      post({ type: "ready", targetLanguage: message.targetLanguage });
      return;
    }

    if (message.type === "translate") {
      await translateText(message);
      return;
    }

    if (message.type === "quality-benchmark") {
      await runQualityBenchmark(message);
      return;
    }

    if (message.type !== "process" || message.sequence <= cancelledThrough) return;

    const transcriptionStartedAt = performance.now();
    const asr = await loadTranscriber();
    if (message.sequence <= cancelledThrough) return;
    const result = await asr(message.audio, { language: "en", task: "transcribe" });
    const transcriptionMs = performance.now() - transcriptionStartedAt;
    const sourceText = Array.isArray(result)
      ? result[0]?.text?.trim() ?? ""
      : "text" in result
        ? String(result.text).trim()
        : "";

    if (!sourceText || message.sequence <= cancelledThrough) return;

    if (message.targetLanguage === "English") {
      post({
        type: "result",
        sequence: message.sequence,
        capturedAt: message.capturedAt,
        submittedAt: message.submittedAt,
        audioDurationMs: message.audioDurationMs,
        sourceText,
        translatedText: sourceText,
        transcriptionMs,
        translationMs: 0,
      });
      return;
    }

    const translationStartedAt = performance.now();
    const translator = await loadTranslator(message.targetLanguage);
    if (!translator || message.sequence <= cancelledThrough) return;
    const translated = await translator(sourceText, TRANSLATION_GENERATION_OPTIONS);
    const translationMs = performance.now() - translationStartedAt;
    const firstResult = Array.isArray(translated) ? translated[0] : translated;
    const candidate = Array.isArray(firstResult) ? firstResult[0] : firstResult;
    const translatedText =
      candidate && typeof candidate === "object" && "translation_text" in candidate
        ? String(candidate.translation_text).trim()
        : "";

    if (message.sequence <= cancelledThrough) return;
    post({
      type: "result",
      sequence: message.sequence,
      capturedAt: message.capturedAt,
      submittedAt: message.submittedAt,
      audioDurationMs: message.audioDurationMs,
      sourceText,
      translatedText,
      transcriptionMs,
      translationMs,
    });
  } catch (error) {
    post({
      type: "error",
      sequence: "sequence" in message ? message.sequence : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
