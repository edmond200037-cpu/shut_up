import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent } from "react";
import type { AudioMarker, EvidenceRecord } from "../types";
import { formatDuration } from "../lib/format";
import { CIRCLED_NUMBERS, markerName } from "../lib/audioMarkers";

export type AudioEvidencePlayerHandle = {
  previewMarker: (id: string) => void;
};

export const AudioEvidencePlayer = forwardRef<AudioEvidencePlayerHandle, {
  record: EvidenceRecord;
  selectedId: string | null;
  onSelect: (id: string) => void;
}>(function AudioEvidencePlayer({
  record,
  selectedId,
  onSelect,
}, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedId);
  const activeSourceUrlRef = useRef("");
  const [duration, setDuration] = useState(record.duration || 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState("");
  const markers = record.markers || [];
  const timelineDuration = Math.max(duration, record.duration || 0, ...markers.map((marker) => marker.timestamp), 1);

  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  function isActiveSource(audio: HTMLAudioElement) {
    return Boolean(activeSourceUrlRef.current) && audio.getAttribute("src") === activeSourceUrlRef.current;
  }

  useEffect(() => {
    const blob = !record.blob.type || record.blob.type === "application/octet-stream"
      ? new Blob([record.blob], { type: record.mime })
      : record.blob;
    const nextUrl = URL.createObjectURL(blob);
    const audio = audioRef.current;

    activeSourceUrlRef.current = nextUrl;

    if (audio) {
      audio.pause();
      audio.src = nextUrl;
      audio.load();
    }

    return () => {
      if (audio && audio.getAttribute("src") === nextUrl) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      if (activeSourceUrlRef.current === nextUrl) activeSourceUrlRef.current = "";
      URL.revokeObjectURL(nextUrl);
    };
  }, [record.blob, record.duration]);

  function describeMediaError(audio: HTMLAudioElement) {
    const detail = audio.error;
    if (!detail) return "音檔無法播放，請確認瀏覽器是否支援此格式。";
    switch (detail.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return "播放已中止，請再試一次。";
      case MediaError.MEDIA_ERR_NETWORK:
        return "音檔讀取失敗，請再試一次。";
      case MediaError.MEDIA_ERR_DECODE:
        return "音檔解碼失敗，可能是檔案損壞或格式不相容。";
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return "瀏覽器不支援這個音檔格式，請改用 MP3、M4A 或 WebM。";
      default:
        return "音檔無法播放，請確認瀏覽器是否支援此格式。";
    }
  }

  function markReady(audio: HTMLAudioElement) {
    if (!isActiveSource(audio)) return;
    const nextDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : record.duration || duration;
    setDuration(nextDuration);
    setIsReady(true);
    setIsLoading(false);
    setPlaybackError("");
  }

  function handlePlaybackFailure(error: unknown) {
    const audio = audioRef.current;
    setIsPlaying(false);
    setIsLoading(false);
    setPlaybackError(
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "瀏覽器阻擋自動播放，請再按一次播放。"
        : audio
          ? describeMediaError(audio)
          : "音檔無法播放，請再試一次。",
    );
  }

  function ensureAudioSource(audio: HTMLAudioElement) {
    const sourceUrl = activeSourceUrlRef.current;
    if (!sourceUrl) {
      setIsPlaying(false);
      setIsLoading(false);
      setPlaybackError("音檔來源尚未建立，請關閉後重新開啟這筆紀錄。");
      return false;
    }
    if (audio.getAttribute("src") !== sourceUrl) {
      audio.src = sourceUrl;
      audio.load();
    }
    return true;
  }

  function syncSelection(time: number) {
    const selected = markers.find((marker) => marker.id === selectedRef.current);
    if (selected && time < selected.timestamp) return;
    const reached = markers.filter((marker) => marker.timestamp <= time).at(-1);
    if (reached && reached.id !== selectedRef.current) onSelect(reached.id);
  }

  function seek(time: number, autoplay = false) {
    const audio = audioRef.current;
    if (!audio) {
      setPlaybackError("播放器尚未準備完成，請再試一次。");
      return;
    }
    if (!ensureAudioSource(audio)) return;
    const next = Math.min(Math.max(0, time), timelineDuration);
    const applySeek = () => {
      audio.currentTime = next;
      setCurrentTime(next);
    };
    if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
      const onMetadata = () => applySeek();
      audio.addEventListener("loadedmetadata", onMetadata, { once: true });
      audio.load();
    } else {
      applySeek();
    }
    if (autoplay) {
      setIsLoading(true);
      setPlaybackError("");
      void audio.play().catch(handlePlaybackFailure);
    }
  }

  function selectMarker(marker: AudioMarker) {
    onSelect(marker.id);
    seek(marker.previewStart, true);
  }

  useImperativeHandle(ref, () => ({
    previewMarker(id: string) {
      const marker = markers.find((item) => item.id === id);
      if (marker) selectMarker(marker);
    },
  }));

  function seekFromTrack(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const next = ratio * timelineDuration;
    seek(next);
    syncSelection(next);
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      setPlaybackError("播放器尚未準備完成，請再試一次。");
      return;
    }
    if (!ensureAudioSource(audio)) return;
    if (!audio.paused) return audio.pause();
    setIsLoading(true);
    setPlaybackError("");
    try {
      if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
        audio.load();
      }
      await audio.play();
    } catch (error) {
      handlePlaybackFailure(error);
    }
  }

  const buttonLabel = playbackError ? "重試" : isLoading && !isReady ? "載入中" : isPlaying ? "暫停" : "播放";

  return (
    <section className="evidence-player" aria-label="錄音播放器">
      <audio
        ref={audioRef}
        preload="auto"
        onLoadedMetadata={(event) => markReady(event.currentTarget)}
        onCanPlay={(event) => markReady(event.currentTarget)}
        onWaiting={() => setIsLoading(true)}
        onStalled={() => {
          setIsLoading(false);
          setPlaybackError("音檔載入停住了，請再按一次播放。");
        }}
        onError={(event) => {
          if (!isActiveSource(event.currentTarget)) return;
          setIsPlaying(false);
          setIsLoading(false);
          setPlaybackError(describeMediaError(event.currentTarget));
        }}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime;
          setCurrentTime(next);
          syncSelection(next);
        }}
        onPlay={() => {
          setIsPlaying(true);
          setIsLoading(false);
          setPlaybackError("");
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsLoading(false);
        }}
      />
      <div className="timeline-times mono"><span>{formatDuration(0)}</span><span>{formatDuration(timelineDuration)}</span></div>
      <div ref={trackRef} className="evidence-timeline" onClick={seekFromTrack}>
        <div className="timeline-rail" />
        <div className="timeline-progress" style={{ width: `${(currentTime / timelineDuration) * 100}%` }} />
        <span className="timeline-playhead" style={{ left: `${(currentTime / timelineDuration) * 100}%` }} />
        {markers.map((marker, index) => (
          <button
            type="button"
            key={marker.id}
            className={`timeline-marker ${selectedId === marker.id ? "active" : ""}`}
            style={{ left: `${(marker.timestamp / timelineDuration) * 100}%` }}
            onClick={() => selectMarker(marker)}
            aria-label={`跳到${markerName(marker, index)}，${formatDuration(marker.timestamp)}`}
          >
            <span>{CIRCLED_NUMBERS[index] || index + 1}</span>
          </button>
        ))}
      </div>
      <button type="button" className="player-toggle" onClick={togglePlayback}>
        <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
        {buttonLabel}
      </button>
      {playbackError && <p className="player-error" role="alert">{playbackError}</p>}
    </section>
  );
});
