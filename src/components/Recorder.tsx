import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { AudioMarker, EvidenceRecord } from "../types";
import { fileOccurredAt, sha256 } from "../lib/files";
import { formatDuration, makeId } from "../lib/format";

const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

function canPlayRecordedMime(audio: HTMLAudioElement, mimeType: string) {
  const support = audio.canPlayType(mimeType);
  return support === "probably" || support === "maybe";
}

function pickRecordingMimeType() {
  const audio = document.createElement("audio");
  return RECORDING_MIME_CANDIDATES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType) && canPlayRecordedMime(audio, mimeType),
  );
}

function resolveAudioExtension(mimeType: string) {
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "bin";
}

function describeRecordedBlobError(audio: HTMLAudioElement) {
  const detail = audio.error;
  if (!detail) return "錄音完成，但瀏覽器無法讀取這份音訊資料。";
  switch (detail.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "錄音完成，但瀏覽器中止了音訊載入。";
    case MediaError.MEDIA_ERR_NETWORK:
      return "錄音完成，但讀取音訊資料時失敗。";
    case MediaError.MEDIA_ERR_DECODE:
      return "錄音完成，但音訊解碼失敗，資料可能不完整。";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "錄音完成，但這份音訊資料沒有被瀏覽器正確辨識。";
    default:
      return "錄音完成，但瀏覽器無法讀取這份音訊資料。";
  }
}

async function validateRecordedBlob(blob: Blob) {
  return await new Promise<number>((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;

    const cleanup = () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      cleanup();
      resolve(duration);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      const message = describeRecordedBlobError(audio);
      cleanup();
      reject(new Error(message));
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = succeed;
    audio.oncanplay = succeed;
    audio.onerror = fail;
    audio.src = url;
    audio.load();
  });
}

export function Recorder({
  onSave,
  onImport,
  flash,
}: {
  onSave: (record: EvidenceRecord) => Promise<void>;
  onImport?: (record: EvidenceRecord) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [markers, setMarkers] = useState<AudioMarker[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const markerRef = useRef<AudioMarker[]>([]);
  const recordingIdRef = useRef("");
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chunkMimeRef = useRef("");

  useEffect(() => {
    markerRef.current = markers;
  }, [markers]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function startClock() {
    lastTickRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const recorder = recorderRef.current;
      if (recorder?.state !== "recording") return;
      const now = Date.now();
      activeSecondsRef.current += (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setElapsed(Math.floor(activeSecondsRef.current));
    }, 500);
  }

  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      flash("此瀏覽器不支援錄音，請改用最新版 Chrome、Edge 或 Safari。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const preferred = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const startedAt = new Date();
      recordingIdRef.current = makeId("AUD");
      chunksRef.current = [];
      chunkMimeRef.current = "";
      markerRef.current = [];
      activeSecondsRef.current = 0;
      setMarkers([]);
      setElapsed(0);
      setIsPaused(false);

      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        if (!chunkMimeRef.current && event.data.type) chunkMimeRef.current = event.data.type;
        chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const mime = chunkMimeRef.current || recorder.mimeType || preferred || "application/octet-stream";
        if (!chunksRef.current.length) {
          stream.getTracks().forEach((track) => track.stop());
          recorderRef.current = null;
          streamRef.current = null;
          flash("錄音失敗，沒有取得可儲存的音訊資料。");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mime });
        if (!blob.size) {
          stream.getTracks().forEach((track) => track.stop());
          recorderRef.current = null;
          streamRef.current = null;
          flash("錄音失敗，音訊資料為空。");
          return;
        }
        try {
          const validatedDuration = await validateRecordedBlob(blob);
          const extension = resolveAudioExtension(mime);
          const record: EvidenceRecord = {
            id: recordingIdRef.current,
            kind: "audio",
            title: `對話錄音 ${startedAt.toLocaleString("zh-TW", { hour12: false })}`,
            occurredAt: startedAt.toISOString(),
            createdAt: new Date().toISOString(),
            duration: Math.max(1, Math.round(validatedDuration || activeSecondsRef.current)),
            tags: [],
            categoryIds: [],
            markers: markerRef.current,
            audioWorkflowStage: markerRef.current.length ? "classifying" : "marking",
            legacyWholeAssignmentPending: false,
            personId: null,
            photoItems: [],
            notes: "",
            mime,
            fileName: `recording-${startedAt.getTime()}.${extension}`,
            fileSize: blob.size,
            sha256: await sha256(blob),
            blob,
          };
          await onSave(record);
          flash("錄音已安全儲存在本機裝置。");
        } catch (error) {
          flash(error instanceof Error ? error.message : "錄音失敗，請重新錄製一次。");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          recorderRef.current = null;
          streamRef.current = null;
        }
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start(1_000);
      setIsRecording(true);
      startClock();
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      flash(denied ? "麥克風權限被拒絕，請在網址列旁重新允許。" : "無法啟動麥克風，請確認沒有其他程式占用。");
    }
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      const now = Date.now();
      activeSecondsRef.current += (now - lastTickRef.current) / 1_000;
      recorder.pause();
      setIsPaused(true);
    } else if (recorder.state === "paused") {
      lastTickRef.current = Date.now();
      recorder.resume();
      setIsPaused(false);
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      activeSecondsRef.current += (Date.now() - lastTickRef.current) / 1_000;
    }
    if (recorder?.state !== "inactive") recorder?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(Math.floor(activeSecondsRef.current));
    setIsRecording(false);
    setIsPaused(false);
  }

  function addQuickMarker() {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    const timestamp = activeSecondsRef.current + (Date.now() - lastTickRef.current) / 1_000;
    const marker: AudioMarker = {
      id: `${recordingIdRef.current}-MARK-${markerRef.current.length + 1}`,
      timestamp,
      previewStart: Math.max(0, timestamp - 10),
      personId: null,
      category: "",
      categoryIds: [],
    };
    markerRef.current = [...markerRef.current, marker];
    setMarkers(markerRef.current);
    flash(`已加入快速${markerRef.current.length} · ${formatDuration(timestamp)}`);
  }

  async function importAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const record: EvidenceRecord = {
        id: makeId("AUD"),
        kind: "audio",
        title: file.name.replace(/\.[^.]+$/, ""),
        occurredAt: fileOccurredAt(file),
        createdAt: new Date().toISOString(),
        tags: [],
        categoryIds: [],
        markers: [],
        audioWorkflowStage: "marking",
        legacyWholeAssignmentPending: false,
        personId: null,
        photoItems: [],
        notes: "由本機匯入；發生時間先採用檔案可用日期，可在明細中修改。",
        mime: file.type || "audio/mpeg",
        fileName: file.name,
        fileSize: file.size,
        sha256: await sha256(file),
        blob: file,
      };
    await (onImport ? onImport(record) : onSave(record));
    event.target.value = "";
    flash("音檔已加入，請先播放並建立快速標籤。");
  }

  return (
    <div className="record-page-grid">
      <section className={`recorder-card ${isRecording ? "recording" : ""}`}>
        <button
          type="button"
          className="measurement-ring"
          onClick={isRecording ? stopRecording : beginRecording}
          aria-label={isRecording ? "停止錄音" : "開始錄音"}
        >
          <svg className="measurement-ring-track" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="46" pathLength="100" />
          </svg>
          <span className="record-button" aria-hidden="true">
            <span className="record-icon">{isRecording ? "■" : "●"}</span>
            <strong>{isRecording ? formatDuration(elapsed) : "開始錄音"}</strong>
            <small>{isRecording ? (isPaused ? "已暫停" : "錄音中 · 點擊停止") : "麥克風資料只留在本機"}</small>
          </span>
        </button>
        <div className="record-controls">
          {isRecording ? (
            <>
              <button className="secondary-button" onClick={togglePause}>{isPaused ? "繼續錄音" : "暫停錄音"}</button>
              <button className="quick-marker-button" disabled={isPaused} onClick={addQuickMarker}>快速標籤</button>
            </>
          ) : (
            <button className="secondary-button" onClick={() => inputRef.current?.click()}>上傳既有音檔</button>
          )}
          <span>{isRecording ? `已加入 ${markers.length} 個時間標記` : "一次處理一個音檔"}</span>
        </div>
        <input ref={inputRef} hidden type="file" accept="audio/*" onChange={importAudio} />
      </section>

      <section className="panel tag-panel">
        <p className="eyebrow">QUICK MARKERS</p>
        <h2>快速標籤</h2>
        <p>錄音中按下「快速標籤」只記錄當下時間，錄完後再到對話對帳單分類。</p>
        {!isRecording && <div className="marker-empty">開始錄音後即可隨時加入時間定位</div>}
        {isRecording && markers.length > 0 && (
          <div className="marker-list">
            {markers.slice().reverse().map((marker, index) => (
              <div key={marker.id}>
                <span className="mono">{formatDuration(marker.timestamp)}</span>
                <strong>快速{markers.length - index}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
