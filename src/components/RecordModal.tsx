import { useEffect, useState } from "react";
import type { EvidenceRecord } from "../types";
import { downloadBlob } from "../lib/files";
import { formatDuration, shortId, toLocalInputValue } from "../lib/format";
import { MediaPreview } from "./MediaPreview";

export function RecordModal({
  record,
  quickTags,
  onClose,
  onSave,
  onDelete,
}: {
  record: EvidenceRecord;
  quickTags: string[];
  onClose: () => void;
  onSave: (record: EvidenceRecord) => Promise<void>;
  onDelete: (record: EvidenceRecord) => Promise<void>;
}) {
  const [draft, setDraft] = useState(record);

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

        <MediaPreview record={draft} />
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

        <fieldset>
          <legend>分類標籤</legend>
          <div className="quick-tags">
            {quickTags.map((tag) => (
              <button type="button" key={tag} className={draft.tags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>
            ))}
          </div>
        </fieldset>

        <label>
          內容與情境說明
          <textarea
            rows={5}
            placeholder="例如：發生地點、在場者、前後文、對方原話……"
            value={draft.notes}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
          />
        </label>

        {!!draft.markers?.length && (
          <div className="modal-markers">
            <strong>錄音時間標記</strong>
            {draft.markers.map((marker, index) => (
              <span key={`${marker.at}-${index}`}>
                <b className="mono">{formatDuration(marker.at)}</b>{marker.tag}
              </span>
            ))}
          </div>
        )}

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
