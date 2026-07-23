import { useEffect, useRef, useState } from "react";
import { EVIDENCE_CATEGORIES, type EvidenceCategory, type EvidenceRecord } from "../types";
import { downloadBlob } from "../lib/files";
import { shortId, toLocalInputValue } from "../lib/format";
import { markerName } from "../lib/audioMarkers";
import { MediaPreview } from "./MediaPreview";
import { AudioEvidencePlayer, type AudioEvidencePlayerHandle } from "./AudioEvidencePlayer";

export function RecordModal({
  record,
  quickTags,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  flash,
}: {
  record: EvidenceRecord;
  quickTags: string[];
  onClose: () => void;
  onSave: (record: EvidenceRecord) => Promise<void>;
  onUpdate: (record: EvidenceRecord) => Promise<void>;
  onDelete: (record: EvidenceRecord) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [draft, setDraft] = useState(record);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const playerRef = useRef<AudioEvidencePlayerHandle>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function toggleTag(tag: string) {
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }));
  }

  async function classifySelected(category: EvidenceCategory) {
    if (!selectedMarkerId) return;
    const markers = (draft.markers || []).map((marker) => marker.id === selectedMarkerId ? { ...marker, category } : marker);
    const next = {
      ...draft,
      markers,
      tags: [...new Set(markers.map((marker) => marker.category).filter(Boolean))],
    };
    setDraft(next);
    await onUpdate(next);
    flash(`✓ 已更新為「${category}」`);
  }

  const audioReconciliation = draft.kind === "audio" ? (
    <div className="audio-reconciliation">
      <section className="marker-strip-section">
        <h3>快速標籤</h3>
        <div className="marker-strip" role="list">
          {(draft.markers || []).map((marker, index) => (
            <button
              type="button"
              role="listitem"
              key={marker.id}
              className={selectedMarkerId === marker.id ? "active" : ""}
              onClick={() => playerRef.current?.previewMarker(marker.id)}
            >
              {markerName(marker, index)}
            </button>
          ))}
          {!draft.markers?.length && <span className="muted">這筆錄音沒有快速標籤</span>}
        </div>
      </section>
      <section className="category-section">
        <h3>分類</h3>
        <div className="category-buttons">
          {EVIDENCE_CATEGORIES.map((category) => (
            <button
              type="button"
              key={category}
              disabled={!selectedMarkerId}
              className={draft.markers?.find((marker) => marker.id === selectedMarkerId)?.category === category ? "active" : ""}
              onClick={() => classifySelected(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label="編輯紀錄">
        <header>
          <div>
            <p className="eyebrow">ENTRY {shortId(draft.id)}</p>
            <h2>紀錄明細</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="關閉">×</button>
        </header>

        {draft.kind === "audio" ? (
          <AudioEvidencePlayer
            key={draft.id}
            ref={playerRef}
            record={draft}
            selectedId={selectedMarkerId}
            onSelect={setSelectedMarkerId}
          />
        ) : (
          <MediaPreview record={draft} />
        )}
        {audioReconciliation}
        <div className="integrity-strip">
          <span>檔案大小 {(draft.fileSize / 1024 / 1024).toFixed(2)} MB</span>
          <span className="mono" title={draft.sha256}>SHA-256 {draft.sha256 ? `${draft.sha256.slice(0, 16)}…` : "舊紀錄未建立"}</span>
        </div>

        <label>
          紀錄標題
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          發生時間
          <input
            type="datetime-local"
            value={toLocalInputValue(draft.occurredAt)}
            onChange={(event) => setDraft({ ...draft, occurredAt: new Date(event.target.value).toISOString() })}
          />
          <small>匯入檔案時會先採用檔案可用日期；若不正確，請在此手動指定。</small>
        </label>

        {draft.kind !== "audio" && (
          <fieldset>
            <legend>分類標籤</legend>
            <div className="quick-tags">
              {quickTags.map((tag) => (
                <button type="button" key={tag} className={draft.tags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>
              ))}
            </div>
          </fieldset>
        )}

        <label>
          內容與情境說明
          <textarea
            rows={5}
            placeholder="例如：發生地點、在場者、前後文、對方原話……"
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>

        <footer>
          <button className="danger-link" onClick={() => onDelete(draft)}>刪除紀錄</button>
          <div>
            <button className="secondary-button" onClick={() => downloadBlob(draft.blob, draft.fileName)}>下載原始檔</button>
            <button className="primary-button" onClick={() => onSave(draft)}>儲存修改</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
