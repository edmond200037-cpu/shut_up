import { useEffect, useRef, useState } from "react";
import type { CategoryDefinition, EvidenceRecord } from "../types";
import { downloadBlob } from "../lib/files";
import { shortId, toLocalInputValue } from "../lib/format";
import { MediaPreview } from "./MediaPreview";
import { AudioEvidencePlayer, type AudioEvidencePlayerHandle } from "./AudioEvidencePlayer";
import { CategorySelector } from "./CategorySelector";
import { categoryColor, categoryName } from "../lib/categories";

export function RecordModal({
  record,
  categories,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  flash,
}: {
  record: EvidenceRecord;
  categories: CategoryDefinition[];
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

  async function updateCategories(categoryIds: string[]) {
    const markers = selectedMarkerId
      ? (draft.markers || []).map((marker) => marker.id === selectedMarkerId ? { ...marker, categoryIds } : marker)
      : draft.markers;
    const next = { ...draft, categoryIds: selectedMarkerId ? draft.categoryIds : categoryIds, markers };
    setDraft(next);
    await onUpdate(next);
    flash("✓ 分類已更新");
  }

  function markerLabel(index: number) {
    return `快速${["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"][index] || index + 1}`;
  }

  function categoryBadges(ids: string[]) {
    return ids.map((id) => (
      <span className={`category-badge category-${categoryColor(id, categories)}`} key={id}>
        {categoryName(id, categories)}
      </span>
    ));
  }

  const audioReconciliation = draft.kind === "audio" ? (
    <div className="audio-reconciliation">
      <section className="marker-strip-section">
        <h3>快速標籤</h3>
        <div className="marker-strip" role="list">
          <button type="button" role="listitem" className={!selectedMarkerId ? "active" : ""} onClick={() => setSelectedMarkerId(null)}>
            <span>整筆錄音</span>
          </button>
          {(draft.markers || []).map((marker, index) => (
            <button
              type="button"
              role="listitem"
              key={marker.id}
              className={selectedMarkerId === marker.id ? "active" : ""}
              onClick={() => playerRef.current?.previewMarker(marker.id)}
            >
              <span>{markerLabel(index)}</span>
              {marker.categoryIds.length > 0 && <span className="marker-classified">已分類</span>}
              <span className="category-badge-row">{categoryBadges(marker.categoryIds)}</span>
            </button>
          ))}
          {!draft.markers?.length && <span className="muted">這筆錄音沒有快速標籤</span>}
        </div>
      </section>
      <CategorySelector
        categories={categories}
        selectedIds={selectedMarkerId ? draft.markers?.find((marker) => marker.id === selectedMarkerId)?.categoryIds || [] : draft.categoryIds}
        onChange={(ids) => void updateCategories(ids)}
        label={selectedMarkerId ? `${markerLabel((draft.markers || []).findIndex((marker) => marker.id === selectedMarkerId))} 分類` : "整筆錄音分類"}
      />
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

        {draft.kind !== "audio" && <CategorySelector categories={categories} selectedIds={draft.categoryIds} onChange={(ids) => void updateCategories(ids)} label="分類標籤" />}

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
