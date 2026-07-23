import { useEffect, useRef, useState } from "react";
import type { CategoryDefinition, EvidenceRecord, PersonDefinition } from "../types";
import { downloadBlob } from "../lib/files";
import { formatDuration, makeId, shortId, toLocalInputValue } from "../lib/format";
import { MediaPreview } from "./MediaPreview";
import { AudioEvidencePlayer, type AudioEvidencePlayerHandle } from "./AudioEvidencePlayer";
import { CategorySelector } from "./CategorySelector";
import { PersonSelector } from "./PersonSelector";
import { categoryColor, categoryName } from "../lib/categories";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function RecordModal({
  record,
  categories,
  people,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  flash,
}: {
  record: EvidenceRecord;
  categories: CategoryDefinition[];
  people: PersonDefinition[];
  onClose: () => void;
  onSave: (record: EvidenceRecord) => Promise<void>;
  onUpdate: (record: EvidenceRecord) => Promise<void>;
  onDelete: (record: EvidenceRecord) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [draft, setDraft] = useState(record);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(record.markers?.[0]?.id || null);
  const [selectedPhotoItemId, setSelectedPhotoItemId] = useState(record.photoItems[0]?.id || null);
  const playerRef = useRef<AudioEvidencePlayerHandle>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function markerLabel(index: number) {
    return `快速${CIRCLED_NUMBERS[index] || index + 1}`;
  }

  function markerDisplay(marker: NonNullable<EvidenceRecord["markers"]>[number], index: number) {
    const labels = marker.categoryIds.map((id) => categoryName(id, categories));
    return {
      title: labels[0] || markerLabel(index),
      extra: labels.length > 1 ? `+${labels.length - 1}` : "",
    };
  }

  function categoryBadges(ids: string[]) {
    return ids.map((id) => (
      <span className={`category-badge category-${categoryColor(id, categories)}`} key={id}>
        {categoryName(id, categories)}
      </span>
    ));
  }

  function currentMarker() {
    return draft.markers?.find((marker) => marker.id === selectedMarkerId);
  }

  function currentPersonId() {
    if (draft.kind === "audio") return currentMarker()?.personId || null;
    return draft.photoItems.find((item) => item.id === selectedPhotoItemId)?.personId || null;
  }

  function currentCategoryIds() {
    if (draft.kind === "audio") return currentMarker()?.categoryIds || [];
    return draft.photoItems.find((item) => item.id === selectedPhotoItemId)?.categoryIds || [];
  }

  async function persist(next: EvidenceRecord) {
    setDraft(next);
    await onUpdate(next);
  }

  async function updateCurrent(patch: { personId?: string | null; categoryIds?: string[] }) {
    if (draft.kind === "audio") {
      if (!selectedMarkerId) return flash("請先選擇一個快速標籤。");
      const next = { ...draft, markers: (draft.markers || []).map((marker) => marker.id === selectedMarkerId ? { ...marker, ...patch } : marker) };
      await persist(next);
      return;
    }
    const next = { ...draft, photoItems: draft.photoItems.map((item) => item.id === selectedPhotoItemId ? { ...item, ...patch } : item) };
    await persist(next);
  }

  async function updateCategories(categoryIds: string[]) {
    await updateCurrent({ categoryIds });
    flash("✓ 分類已更新");
  }

  async function updatePerson(personId: string | null) {
    await updateCurrent({ personId });
    flash(personId ? "✓ 已指定人物" : "✓ 已改為未指定");
  }

  async function addMarkerAtCurrentTime(timestamp: number) {
    const safeTimestamp = Math.max(0, Math.round(timestamp * 100) / 100);
    const marker = {
      id: makeId("MARK"),
      timestamp: safeTimestamp,
      previewStart: Math.max(0, safeTimestamp - 10),
      personId: null,
      categoryIds: [],
      category: "",
    };
    const next = { ...draft, markers: [...(draft.markers || []), marker], audioWorkflowStage: "marking" as const };
    await persist(next);
    setSelectedMarkerId(marker.id);
    flash(`${markerLabel((next.markers || []).length - 1)} 已建立 · ${marker.timestamp.toFixed(2)} 秒`);
  }

  async function deleteMarker(markerId: string) {
    const marker = draft.markers?.find((item) => item.id === markerId);
    if (!marker) return;
    if ((marker.categoryIds.length || marker.personId) && !window.confirm("這個快速標籤已有人物或分類，刪除後會移除對應金額，確定繼續？")) return;
    const nextMarkers = (draft.markers || []).filter((item) => item.id !== markerId);
    const next = { ...draft, markers: nextMarkers, audioWorkflowStage: nextMarkers.length ? draft.audioWorkflowStage : "marking" as const };
    await persist(next);
    setSelectedMarkerId(nextMarkers[0]?.id || null);
    flash("已刪除快速標籤。");
  }

  async function completeMarking() {
    if (!draft.markers?.length) return flash("請先建立至少一個快速標籤。");
    const next = { ...draft, audioWorkflowStage: "classifying" as const };
    await persist(next);
    setSelectedMarkerId(next.markers?.[0]?.id || null);
    flash("快速標記完成，現在可以開始分類。");
  }

  async function resumeMarking() {
    const next = { ...draft, audioWorkflowStage: "marking" as const };
    await persist(next);
    flash("已返回快速標記階段。");
  }

  async function moveLegacyAssignment() {
    if (!draft.legacyWholeAssignmentPending) return;
    if (!selectedMarkerId) return flash("請先選擇要接收舊分類的快速標籤。");
    const next = {
      ...draft,
      categoryIds: [],
      personId: null,
      legacyWholeAssignmentPending: false,
      markers: (draft.markers || []).map((marker) => marker.id === selectedMarkerId
        ? { ...marker, categoryIds: [...new Set([...marker.categoryIds, ...draft.categoryIds])], personId: draft.personId }
        : marker),
    };
    await persist(next);
    flash("舊版整筆分類已移轉到目前快速標籤。");
  }

  async function addPhotoItem() {
    const item = { id: makeId("EVD"), personId: null, categoryIds: [] };
    const next = { ...draft, photoItems: [...draft.photoItems, item] };
    await persist(next);
    setSelectedPhotoItemId(item.id);
    flash(`已新增證據${CIRCLED_NUMBERS[next.photoItems.length - 1] || next.photoItems.length}`);
  }

  async function removePhotoItem() {
    if (draft.photoItems.length <= 1) return flash("照片至少需要保留一筆證據。");
    if (!window.confirm("刪除目前這筆照片證據分項？")) return;
    const nextItems = draft.photoItems.filter((item) => item.id !== selectedPhotoItemId);
    const next = { ...draft, photoItems: nextItems };
    await persist(next);
    setSelectedPhotoItemId(nextItems[0]?.id || null);
    flash("已刪除照片證據分項。");
  }

  const audioReconciliation = draft.kind === "audio" ? (
    <div className="audio-reconciliation">
      {draft.legacyWholeAssignmentPending && (
        <div className="legacy-assignment-notice">
          <strong>舊版整筆分類待補快速標籤</strong>
          <span>目前分類暫不計價，請選擇快速標籤後移轉。</span>
          <button type="button" className="secondary-button" onClick={() => void moveLegacyAssignment()}>移轉到目前標籤</button>
        </div>
      )}
      <section className="marker-strip-section">
        <div className="section-inline-title"><h3>快速標籤</h3><span>{draft.audioWorkflowStage === "marking" ? "01／快速標記" : "02／分類"}</span></div>
        <div className="marker-strip" role="list">
          {(draft.markers || []).map((marker, index) => {
            const display = markerDisplay(marker, index);
            return (
              <div className={`marker-pill-wrap ${selectedMarkerId === marker.id ? "active" : ""}`} key={marker.id}>
                <button type="button" role="listitem" className="marker-pill" onClick={() => playerRef.current?.previewMarker(marker.id)}>
                  <strong>{display.title}</strong>{display.extra && <small>{display.extra}</small>}<span className="marker-person">{marker.categoryIds.length ? (people.find((person) => person.id === marker.personId)?.name || "未指定") : formatDuration(marker.timestamp)}</span>
                </button>
                {draft.audioWorkflowStage === "marking" && <button type="button" className="marker-delete" aria-label={`刪除${markerLabel(index)}`} onClick={() => void deleteMarker(marker.id)}>×</button>}
              </div>
            );
          })}
          {!draft.markers?.length && <span className="muted">播放到目標位置後，按下新增標籤。</span>}
        </div>
      </section>
      {draft.audioWorkflowStage === "marking" ? (
        <div className="marker-workflow-actions">
          <button type="button" className="secondary-button" onClick={() => playerRef.current?.addMarkerAtCurrentTime()}>＋在目前位置新增快速標籤</button>
          <button type="button" className="primary-button" onClick={() => void completeMarking()}>完成快速標記 → 開始分類</button>
        </div>
      ) : (
        <>
          <button type="button" className="text-button workflow-back-button" onClick={() => void resumeMarking()}>← 返回修改快速標記</button>
          {selectedMarkerId ? (
            <>
              <PersonSelector people={people} value={currentPersonId()} onChange={(value) => void updatePerson(value)} />
              <CategorySelector categories={categories} selectedIds={currentCategoryIds()} onChange={(ids) => void updateCategories(ids)} label={`${markerLabel((draft.markers || []).findIndex((marker) => marker.id === selectedMarkerId))} 分類`} />
            </>
          ) : <p className="muted">請先選擇快速標籤，再指定人物與分類。</p>}
        </>
      )}
    </div>
  ) : null;

  const photoReconciliation = draft.kind === "photo" ? (
    <div className="photo-reconciliation">
      <div className="photo-evidence-head"><h3>照片證據</h3><button type="button" className="secondary-button" onClick={() => void addPhotoItem()}>＋新增證據</button></div>
      <div className="photo-evidence-tabs" role="list">
        {draft.photoItems.map((item, index) => (
          <button type="button" role="listitem" key={item.id} className={item.id === selectedPhotoItemId ? "active" : ""} onClick={() => setSelectedPhotoItemId(item.id)}>
            證據{CIRCLED_NUMBERS[index] || index + 1}{item.categoryIds.length > 0 && <span className="marker-classified">已分類</span>}
          </button>
        ))}
      </div>
      <PersonSelector people={people} value={currentPersonId()} onChange={(value) => void updatePerson(value)} />
      <CategorySelector categories={categories} selectedIds={currentCategoryIds()} onChange={(ids) => void updateCategories(ids)} label="分類標籤" />
      <button type="button" className="danger-link photo-evidence-remove" onClick={() => void removePhotoItem()}>刪除目前證據分項</button>
    </div>
  ) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-label="編輯紀錄">
        <header><div><p className="eyebrow">ENTRY {shortId(draft.id)}</p><h2>紀錄明細</h2></div><button className="close-button" onClick={onClose} aria-label="關閉">×</button></header>
        {draft.kind === "audio" ? <AudioEvidencePlayer key={draft.id} ref={playerRef} record={draft} selectedId={selectedMarkerId} onSelect={setSelectedMarkerId} onCreateMarker={(timestamp) => void addMarkerAtCurrentTime(timestamp)} /> : <MediaPreview record={draft} />}
        {audioReconciliation}
        {photoReconciliation}
        <div className="integrity-strip"><span>檔案大小 {(draft.fileSize / 1024 / 1024).toFixed(2)} MB</span><span className="mono" title={draft.sha256}>SHA-256 {draft.sha256 ? `${draft.sha256.slice(0, 16)}…` : "舊紀錄未建立"}</span></div>
        <label>紀錄標題<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>發生時間<input type="datetime-local" value={toLocalInputValue(draft.occurredAt)} onChange={(event) => setDraft({ ...draft, occurredAt: new Date(event.target.value).toISOString() })} /><small>匯入檔案時會先採用檔案可用日期；若不正確，請在此手動指定。</small></label>
        <label>內容與情境說明<textarea rows={5} placeholder="例如：發生地點、在場者、前後文、對方原話……" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <footer><button className="danger-link" onClick={() => onDelete(draft)}>刪除紀錄</button><div><button className="secondary-button" onClick={() => downloadBlob(draft.blob, draft.fileName)}>下載原始檔</button><button className="primary-button" onClick={() => onSave(draft)}>儲存修改</button></div></footer>
      </section>
    </div>
  );
}
