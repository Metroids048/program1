// Thin wrappers over the browser-native Web Speech API (SpeechRecognition +
// speechSynthesis). Everything here is client-side and runs only after an
// explicit user click — used for interview *preparation* practice, never for
// covert assistance during a real interview. All APIs are feature-detected so
// unsupported browsers (and jsdom in tests) degrade gracefully.

// SpeechRecognition is not part of lib.dom.d.ts, so declare the minimal shape.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== undefined;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface DictationHandle {
  stop: () => void;
}

interface DictationOptions {
  lang?: string;
  onText: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "麦克风权限被拒绝，请在浏览器设置中允许后重试。",
  "service-not-allowed": "麦克风权限被拒绝，请在浏览器设置中允许后重试。",
  "no-speech": "没有检测到语音，请靠近麦克风再试一次。",
  "audio-capture": "未检测到麦克风设备。",
  network: "语音识别服务网络异常，请稍后再试。",
};

export function startDictation(options: DictationOptions): DictationHandle | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = options.lang ?? "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? "";
      options.onText(transcript, result.isFinal);
    }
  };
  recognition.onerror = (event) => {
    options.onError(ERROR_MESSAGES[event.error] ?? "语音识别出错，请改用文字作答。");
  };
  recognition.onend = () => options.onEnd();

  try {
    recognition.start();
  } catch {
    return null;
  }
  return { stop: () => recognition.stop() };
}

export function speak(text: string, lang = "zh-CN"): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export function cancelSpeak(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
