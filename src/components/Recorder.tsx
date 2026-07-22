import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { EvidenceRecord, Marker } from "../types";
import { fileOccurredAt, sha256 } from "../lib/files";
import { formatDuration, makeId } from "../lib/format";

export function Recorder({
  quickTags,
  onSave,
  flash,
}: {
  quickTags: string[];
  onSave: (record: EvidenceRecord) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const markerRef = useRef<Marker[]>([]);
  const activeSecondsRef = useRef(0);
  const lastTickRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      const startedAt = new Date();
      chunksRef.current = [];
      markerRef.current = [];
      activeSecondsRef.current = 0;
      setMarkers([]);
      setPendingTags([]);
      setElapsed(0);
      setIsPaused(false);

      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        const mime = recorder.mimeType || preferred || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const extension = mime.includes("mp4") ? "m4a" : "webm";
        const record: EvidenceRecord = {
          id: makeId("AUD"),
          kind: "audio",
          title: `對話錄音 ${startedAt.toLocaleString("zh-TW", { hour12: false })}`,
          occurredAt: startedAt.toISOString(),
          createdAt: new Date().toISOString(),
          duration: Math.max(1, Math.round(activeSecondsRef.current)),
          tags: [...new Set(markerRef.current.map((marker) => marker.tag))],
          markers: markerRef.current,
          notes: "",
          mime,
          fileName: `recording-${startedAt.getTime()}.${extension}`,
          fileSize: blob.size,
          sha256: await sha256(blob),
          blob,
        };
        stream.getTracks().forEach((track) => track.stop());
        await onSave(record);
        flash("錄音已安全儲存在本機裝置。");
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

  function toggleTag(tag: string) {
    if (isRecording) {
      const marker = { at: elapsed, tag };
      markerRef.current = [...markerRef.current, marker];
      setMarkers(markerRef.current);
      flash(`已在 ${formatDuration(elapsed)} 標記「${tag}」`);
      return;
    }
    setPendingTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  async function importAudio(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      await onSave({
        id: makeId("AUD"),
        kind: "audio",
        title: file.name.replace(/\.[^.]+$/, ""),
        occurredAt: fileOccurredAt(file),
        createdAt: new Date().toISOString(),
        tags: pendingTags,
        markers: [],
        notes: "由本機匯入；發生時間先採用檔案可用日期，可在明細中修改。",
        mime: file.type || "audio/mpeg",
        fileName: file.name,
        fileSize: file.size,
        sha256: await sha256(file),
        blob: file,
      });
    }
    event.target.value = "";
    setPendingTags([]);
    if (files.length) flash(`已加入 ${files.length} 個音檔。`);
  }

  return (
    <div className="record-page-grid">
      <section className={`recorder-card ${isRecording ? "recording" : ""}`}>
        <div className="measurement-ring">
          <button
            className="record-button"
            onClick={isRecording ? stopRecording : beginRecording}
            aria-label={isRecording ? "停止錄音" : "開始錄音"}
          >
            <span className="record-icon">{isRecording ? "■" : "●"}</span>
            <strong>{isRecording ? formatDuration(elapsed) : "開始錄音"}</strong>
            <small>{isRecording ? (isPaused ? "已暫停" : "錄音中 · 點擊停止") : "麥克風資料只留在本機"}</small>
          </button>
        </div>
        <div className="record-controls">
          {isRecording ? (
            <button className="secondary-button" onClick={togglePause}>{isPaused ? "繼續錄音" : "暫停錄音"}</button>
          ) : (
            <button className="secondary-button" onClick={() => inputRef.current?.click()}>上傳既有音檔</button>
          )}
          <span>{isRecording ? `已加入 ${markers.length} 個時間標記` : "支援多檔匯入"}</span>
        </div>
        <input ref={inputRef} hidden type="file" accept="audio/*" multiple onChange={importAudio} />
      </section>

      <section className="panel tag-panel">
        <p className="eyebrow">QUICK MARKERS</p>
        <h2>快速標記</h2>
        <p>錄音中點擊會記錄當下時間；上傳前點擊則套用為初步標籤。</p>
        <div className="quick-tags">
          {quickTags.map((tag) => (
            <button
              key={tag}
              className={pendingTags.includes(tag) || markers.some((marker) => marker.tag === tag) ? "active" : ""}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        {isRecording && markers.length > 0 && (
          <div className="marker-list">
            {markers.slice().reverse().map((marker, index) => (
              <div key={`${marker.at}-${index}`}>
                <span className="mono">{formatDuration(marker.at)}</span>
                <strong>{marker.tag}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
