"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "dashboard" | "record" | "photos" | "ledger" | "checkout" | "settings";
type EvidenceKind = "audio" | "photo";

type Marker = { at: number; tag: string };
type EvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  title: string;
  createdAt: string;
  duration?: number;
  tags: string[];
  markers?: Marker[];
  notes: string;
  amount?: number;
  mime: string;
  fileName: string;
  blob: Blob;
};

const DB_NAME = "swear-cashier-local";
const DB_VERSION = 1;
const RECORD_STORE = "evidence";
const SETTING_STORE = "settings";
const QUICK_TAGS = ["貶抑侮辱", "威脅恐嚇", "咆哮斥責", "排擠孤立", "不當要求"];

const navItems: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "總覽", icon: "▦" },
  { id: "record", label: "對話錄音", icon: "●" },
  { id: "photos", label: "照片紀錄", icon: "▣" },
  { id: "ledger", label: "對話對帳單", icon: "▤" },
  { id: "checkout", label: "結帳", icon: "▥" },
  { id: "settings", label: "設定", icon: "⚙" },
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) db.createObjectStore(RECORD_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTING_STORE)) db.createObjectStore(SETTING_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(): Promise<EvidenceRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll();
    request.onsuccess = () => resolve(request.result as EvidenceRecord[]);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(record: EvidenceRecord) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(id: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbClear() {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([RECORD_STORE, SETTING_STORE], "readwrite");
    tx.objectStore(RECORD_STORE).clear();
    tx.objectStore(SETTING_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function makeId(prefix = "EV") {
  return `${prefix}-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function shortId(id: string) {
  return id.split("-").slice(-2).join("-").slice(0, 13).toUpperCase();
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 255;
  target[offset + 1] = (value >>> 8) & 255;
}
function write32(target: Uint8Array, offset: number, value: number) {
  write16(target, offset, value & 65535);
  write16(target, offset + 2, value >>> 16);
}
function read16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function read32(view: DataView, offset: number) { return view.getUint32(offset, true); }
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function createZip(entries: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    write32(local, 0, 0x04034b50); write16(local, 4, 20); write16(local, 6, 0x0800); write16(local, 8, 0);
    write32(local, 14, crc); write32(local, 18, entry.data.length); write32(local, 22, entry.data.length); write16(local, 26, name.length);
    local.set(name, 30); local.set(entry.data, 30 + name.length); locals.push(local);
    const central = new Uint8Array(46 + name.length);
    write32(central, 0, 0x02014b50); write16(central, 4, 20); write16(central, 6, 20); write16(central, 8, 0x0800);
    write32(central, 16, crc); write32(central, 20, entry.data.length); write32(central, 24, entry.data.length); write16(central, 28, name.length);
    write32(central, 42, offset); central.set(name, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50); write16(end, 8, entries.length); write16(end, 10, entries.length);
  write32(end, 12, centralSize); write32(end, 16, offset);
  return new Blob([...locals, ...centrals, end].map(toArrayBuffer), { type: "application/zip" });
}

function readStoredZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 30 <= buffer.byteLength && read32(view, offset) === 0x04034b50) {
    const method = read16(view, offset + 8);
    if (method !== 0) throw new Error("此備份使用不支援的壓縮格式");
    const size = read32(view, offset + 18);
    const nameLength = read16(view, offset + 26);
    const extraLength = read16(view, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength));
    files.set(name, new Uint8Array(buffer.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

function MediaPreview({ record }: { record: EvidenceRecord }) {
  const url = useMemo(() => URL.createObjectURL(record.blob), [record.blob]);
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return record.kind === "audio" ? <audio controls src={url} /> : <img className="detail-image" src={url} alt={record.title} />;
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [activeRecord, setActiveRecord] = useState<EvidenceRecord | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [storageText, setStorageText] = useState("計算中…");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  async function updateStorage() {
    if (!navigator.storage?.estimate) return setStorageText("瀏覽器未提供容量資訊");
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    setStorageText(`已使用 ${(usage / 1024 / 1024).toFixed(1)} MB／可用約 ${(quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
  }

  async function refresh() {
    const all = await dbGetAll();
    setRecords(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoading(false);
    await updateStorage();
  }

  useEffect(() => {
    let cancelled = false;
    dbGetAll().then((all) => {
      if (cancelled) return;
      setRecords(all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLoading(false);
      if (navigator.storage?.estimate) navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
        if (!cancelled) setStorageText(`已使用 ${(usage / 1024 / 1024).toFixed(1)} MB／可用約 ${(quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
      });
    }).catch(() => { if (!cancelled) setNotice("無法讀取本機資料庫，請確認瀏覽器未停用網站儲存。"); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); recorderRef.current?.stream.getTracks().forEach((track) => track.stop()); }, []);

  const todayKey = new Date().toLocaleDateString("zh-TW");
  const todays = records.filter((record) => new Date(record.createdAt).toLocaleDateString("zh-TW") === todayKey);
  const audioCount = records.filter((r) => r.kind === "audio").length;
  const photoCount = records.filter((r) => r.kind === "photo").length;
  const totalDuration = records.reduce((sum, r) => sum + (r.duration || 0), 0);
  const totalAmount = records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const filtered = useMemo(() => records.filter((r) => `${r.title} ${r.notes} ${r.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [records, query]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3800);
  }

  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return flash("此瀏覽器不支援錄音，請改用最新版 Chrome、Edge 或 Safari。 ");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      chunksRef.current = [];
      setMarkers([]); setPendingTags([]); setElapsed(0); setIsPaused(false);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || preferred || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const snapshotMarkers = markersRef.current;
        const record: EvidenceRecord = {
          id: makeId("AUD"), kind: "audio", title: `對話錄音 ${new Date().toLocaleString("zh-TW", { hour12: false })}`,
          createdAt: new Date(startedAtRef.current).toISOString(), duration, tags: [...new Set(snapshotMarkers.map((m) => m.tag))],
          markers: snapshotMarkers, notes: "", mime, fileName: `recording-${Date.now()}.${ext}`, blob,
        };
        await dbPut(record); stream.getTracks().forEach((track) => track.stop()); await refresh();
        flash("錄音已安全儲存在本機裝置。 ");
      };
      recorderRef.current = recorder; startedAtRef.current = Date.now(); recorder.start(1000); setIsRecording(true);
      timerRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)), 500);
    } catch (error) {
      flash(error instanceof DOMException && error.name === "NotAllowedError" ? "麥克風權限被拒絕，請在網址列旁重新允許。" : "無法啟動麥克風，請確認沒有其他程式占用。 ");
    }
  }

  const markersRef = useRef<Marker[]>([]);
  useEffect(() => { markersRef.current = markers; }, [markers]);

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") { recorder.pause(); setIsPaused(true); }
    else if (recorder.state === "paused") { recorder.resume(); setIsPaused(false); }
  }

  function stopRecording() {
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false); setIsPaused(false);
  }

  function addMarker(tag: string) {
    if (isRecording) {
      setMarkers((items) => [...items, { at: elapsed, tag }]);
      flash(`已在 ${formatDuration(elapsed)} 標記「${tag}」`);
    } else {
      setPendingTags((items) => items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]);
    }
  }

  async function importAudio(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    for (const file of files) await dbPut({ id: makeId("AUD"), kind: "audio", title: file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), tags: pendingTags, notes: "由本機上傳", mime: file.type || "audio/mpeg", fileName: file.name, blob: file });
    event.target.value = ""; setPendingTags([]); await refresh(); flash(`已加入 ${files.length} 個音檔。`);
  }

  async function importPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    for (const file of files) await dbPut({ id: makeId("IMG"), kind: "photo", title: file.name.replace(/\.[^.]+$/, ""), createdAt: new Date().toISOString(), tags: pendingTags, notes: "", mime: file.type || "image/jpeg", fileName: file.name, blob: file });
    event.target.value = ""; setPendingTags([]); await refresh(); flash(`已加入 ${files.length} 張照片。`);
  }

  async function saveActive() {
    if (!activeRecord) return;
    await dbPut(activeRecord); setActiveRecord(null); await refresh(); flash("紀錄已更新。 ");
  }

  async function removeRecord(record: EvidenceRecord) {
    if (!confirm(`確定刪除「${record.title}」？此操作無法復原。`)) return;
    await dbDelete(record.id); setActiveRecord(null); await refresh(); flash("紀錄已刪除。 ");
  }

  async function updateAmount(record: EvidenceRecord, amount: number) {
    await dbPut({ ...record, amount: Number.isFinite(amount) ? amount : 0 }); await refresh();
  }

  async function exportBackup() {
    const entries: { name: string; data: Uint8Array }[] = [];
    const manifestRecords = [];
    for (const record of records) {
      const ext = record.fileName.includes(".") ? record.fileName.split(".").pop() : record.kind === "audio" ? "webm" : "jpg";
      const mediaPath = `media/${record.id}.${ext}`;
      entries.push({ name: mediaPath, data: new Uint8Array(await record.blob.arrayBuffer()) });
      const { blob: _blob, ...meta } = record;
      void _blob;
      manifestRecords.push({ ...meta, mediaPath });
    }
    const manifest = { format: "swear-cashier-backup", version: 1, exportedAt: new Date().toISOString(), records: manifestRecords };
    entries.unshift({ name: "backup.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const zip = await createZip(entries);
    downloadBlob(zip, `髒話收銀機備份-${new Date().toISOString().slice(0, 10)}.zip`); flash("ZIP 備份已匯出，請妥善保存。 ");
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const files = readStoredZip(await file.arrayBuffer());
      const manifestBytes = files.get("backup.json");
      if (!manifestBytes) throw new Error("找不到 backup.json");
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (manifest.format !== "swear-cashier-backup") throw new Error("不是髒話收銀機備份");
      let restored = 0;
      for (const item of manifest.records) {
        const bytes = files.get(item.mediaPath); if (!bytes) continue;
        const { mediaPath: _path, ...meta } = item;
        void _path;
        await dbPut({ ...meta, blob: new Blob([toArrayBuffer(bytes)], { type: item.mime }) }); restored++;
      }
      await refresh(); flash(`已還原 ${restored} 筆紀錄；相同編號會更新，不會重複。`);
    } catch (error) { flash(`還原失敗：${error instanceof Error ? error.message : "檔案無法讀取"}`); }
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) return flash("此瀏覽器不支援永久儲存申請。 ");
    flash((await navigator.storage.persist()) ? "瀏覽器已允許較穩定地保留資料。" : "瀏覽器未授予永久儲存；請定期匯出 ZIP 備份。 ");
  }

  const renderRecordRows = (items: EvidenceRecord[], limit?: number) => (
    <div className="record-table-wrap">
      <table className="record-table">
        <thead><tr><th>編號</th><th>類型</th><th>內容摘要</th><th>時間</th><th>時長／數量</th><th>標籤</th><th>備註</th></tr></thead>
        <tbody>
          {(limit ? items.slice(0, limit) : items).map((record, index) => (
            <tr key={record.id} onClick={() => setActiveRecord(record)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setActiveRecord(record)}>
              <td className="mono">{String(index + 1).padStart(3, "0")}</td>
              <td><span className="type-symbol">{record.kind === "audio" ? "●" : "▣"}</span>{record.kind === "audio" ? "錄音" : "照片"}</td>
              <td><strong>{record.title}</strong><small>{record.notes || "尚未填寫說明"}</small></td>
              <td className="mono">{formatDate(record.createdAt)}</td>
              <td className="mono">{record.kind === "audio" ? formatDuration(record.duration) : "1 張"}</td>
              <td>{record.tags.length ? record.tags.slice(0, 2).map((tag) => <span className="mini-tag" key={tag}>{tag}</span>) : <span className="muted">未標記</span>}</td>
              <td><button className="icon-button" aria-label="開啟紀錄">▤</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <div className="empty-state">目前沒有符合條件的紀錄</div>}
    </div>
  );

  const recorderPanel = (
    <section className={`recorder-card ${isRecording ? "recording" : ""}`}>
      <div className="measurement-ring">
        <button className="record-button" onClick={isRecording ? stopRecording : beginRecording} aria-label={isRecording ? "停止錄音" : "開始錄音"}>
          <span className="record-icon">{isRecording ? "■" : "●"}</span>
          <strong>{isRecording ? formatDuration(elapsed) : "開始錄音"}</strong>
          {isRecording && <small>{isPaused ? "已暫停" : "錄音中 · 點擊停止"}</small>}
        </button>
      </div>
      {isRecording ? (
        <div className="record-controls"><button className="secondary-button" onClick={togglePause}>{isPaused ? "繼續錄音" : "暫停錄音"}</button><span>已加入 {markers.length} 個時間標記</span></div>
      ) : (
        <div className="record-controls"><button className="secondary-button" onClick={() => audioInput.current?.click()}>上傳既有音檔</button><span>錄音只儲存在這台裝置</span></div>
      )}
      <input ref={audioInput} hidden type="file" accept="audio/*" multiple onChange={importAudio} />
    </section>
  );

  function pageHeader(title: string, subtitle: string) {
    return <header className="page-header"><div><p className="eyebrow">LOCAL EVIDENCE REGISTER</p><h1>{title}</h1><p>{subtitle}</p></div><div className="header-meta"><span className="mono">{new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })}</span><span className="local-badge">▣ 本機模式</span></div></header>;
  }

  function Dashboard() {
    return <>{pageHeader("總覽", "快速記錄、核對與整理今日蒐證資料")}
      <div className="dashboard-grid">
        {recorderPanel}
        <section className="receipt-card">
          <div className="receipt-teeth top" /><h2>今日摘要</h2>
          <div className="receipt-lines">
            <div><span>日期</span><strong>{new Date().toLocaleDateString("zh-TW")}</strong></div>
            <div><span>今日錄音</span><strong>{todays.filter((r) => r.kind === "audio").length} 筆</strong></div>
            <div><span>今日照片</span><strong>{todays.filter((r) => r.kind === "photo").length} 張</strong></div>
            <div><span>全部錄音時長</span><strong>{formatDuration(totalDuration)}</strong></div>
            <div><span>待補充說明</span><strong>{records.filter((r) => !r.notes).length} 筆</strong></div>
          </div>
          <div className="receipt-total"><span>對帳單總額</span><strong>NT$ {totalAmount.toLocaleString("zh-TW")}</strong></div>
          <p className="receipt-number mono">RCPT-{new Date().toISOString().slice(0, 10).replaceAll("-", "")}-{String(records.length + 1).padStart(3, "0")}</p>
          <div className="barcode" /><div className="receipt-teeth bottom" />
        </section>
      </div>
      <section className="panel recent-panel"><div className="section-title"><div><p className="eyebrow">RECENT ENTRIES</p><h2>最近紀錄</h2></div><button className="text-button" onClick={() => setView("ledger")}>查看全部 →</button></div>{renderRecordRows(records, 6)}</section>
    </>;
  }

  function RecordPage() {
    return <>{pageHeader("對話錄音", "開始錄音或匯入既有音檔，錄音過程可即時加上時間標記")}
      <div className="record-page-grid">{recorderPanel}<section className="panel tag-panel"><p className="eyebrow">QUICK MARKERS</p><h2>快速標記</h2><p>錄音中點擊會記錄當下時間；上傳前點擊則套用為初步標籤。</p><div className="quick-tags">{QUICK_TAGS.map((tag) => <button key={tag} className={(pendingTags.includes(tag) || markers.some((m) => m.tag === tag)) ? "active" : ""} onClick={() => addMarker(tag)}>{tag}</button>)}</div>{isRecording && <div className="marker-list">{markers.slice().reverse().map((m, i) => <div key={`${m.at}-${i}`}><span className="mono">{formatDuration(m.at)}</span><strong>{m.tag}</strong></div>)}</div>}</section></div>
      <section className="panel"><div className="section-title"><h2>錄音紀錄</h2><input className="search-input" placeholder="搜尋標題、標籤或備註" value={query} onChange={(e) => setQuery(e.target.value)} /></div>{renderRecordRows(filtered.filter((r) => r.kind === "audio"))}</section>
    </>;
  }

  function PhotoPage() {
    const photos = filtered.filter((r) => r.kind === "photo");
    return <>{pageHeader("照片紀錄", "加入現場照片、截圖或文件影像，並補上來源與說明")}
      <section className="upload-zone" onClick={() => photoInput.current?.click()}><span className="upload-symbol">＋</span><h2>新增照片紀錄</h2><p>點擊選擇照片，可一次加入多張；原始檔只保存在本機</p><button className="primary-button">選擇照片</button><input ref={photoInput} hidden type="file" accept="image/*" multiple onChange={importPhotos} /></section>
      <section className="panel"><div className="section-title"><h2>照片資料</h2><input className="search-input" placeholder="搜尋照片紀錄" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="photo-grid">{photos.map((record) => <button className="photo-card" key={record.id} onClick={() => setActiveRecord(record)}><MediaPreview record={record} /><span><strong>{record.title}</strong><small>{formatDate(record.createdAt)}</small></span></button>)}</div>
        {!photos.length && <div className="empty-state">尚未加入照片紀錄</div>}
      </section>
    </>;
  }

  function LedgerPage() {
    return <>{pageHeader("對話對帳單", "逐筆補充內容、分類標籤與備註，建立可核對的時間序列")}
      <section className="panel"><div className="section-title"><div><p className="eyebrow">EVIDENCE LEDGER</p><h2>全部蒐證紀錄</h2></div><input className="search-input" placeholder="搜尋全部紀錄" value={query} onChange={(e) => setQuery(e.target.value)} /></div>{renderRecordRows(filtered)}</section>
    </>;
  }

  function CheckoutPage() {
    return <>{pageHeader("結帳", "由你自行輸入每筆紀錄的計價金額；系統不設定預設價格")}
      <div className="checkout-layout"><section className="panel"><div className="section-title"><div><p className="eyebrow">LINE ITEMS</p><h2>計價項目</h2></div><span>{records.length} 筆</span></div>
        <div className="checkout-list">{records.map((record, index) => <div className="checkout-row" key={record.id}><span className="mono">{String(index + 1).padStart(3, "0")}</span><div><strong>{record.title}</strong><small>{formatDate(record.createdAt)} · {record.tags.join("、") || "未分類"}</small></div><label>NT$<input type="number" min="0" step="1" value={record.amount || ""} placeholder="0" onChange={(e) => updateAmount(record, Number(e.target.value))} /></label></div>)}</div>
        {!records.length && <div className="empty-state">尚無可結帳紀錄</div>}
      </section><aside className="receipt-card checkout-receipt"><div className="receipt-teeth top" /><p className="eyebrow">CHECKOUT RECEIPT</p><h2>結帳摘要</h2><div className="receipt-lines"><div><span>計價筆數</span><strong>{records.filter((r) => (r.amount || 0) > 0).length}</strong></div><div><span>錄音</span><strong>{audioCount} 筆</strong></div><div><span>照片</span><strong>{photoCount} 張</strong></div></div><div className="receipt-total"><span>合計</span><strong>NT$ {totalAmount.toLocaleString("zh-TW")}</strong></div><button className="dark-button" onClick={() => window.print()}>列印／另存 PDF</button><p className="fine-print">本頁金額為使用者自行設定的紀錄統計，不代表法院、主管機關或法律規定的賠償認定。</p><div className="receipt-teeth bottom" /></aside></div>
    </>;
  }

  function SettingsPage() {
    return <>{pageHeader("設定", "管理本機資料、備份與裝置儲存狀態")}
      <div className="settings-grid"><section className="panel setting-card"><span className="setting-icon">ZIP</span><div><h2>完整備份與還原</h2><p>備份包含錄音、照片、標籤、備註與自訂金額。還原只支援由本工具匯出的 ZIP。</p><div className="button-row"><button className="primary-button" onClick={exportBackup}>匯出 ZIP 備份</button><button className="secondary-button" onClick={() => backupInput.current?.click()}>從 ZIP 還原</button><input ref={backupInput} hidden type="file" accept=".zip,application/zip" onChange={restoreBackup} /></div></div></section>
      <section className="panel setting-card"><span className="setting-icon">SSD</span><div><h2>本機儲存</h2><p>{storageText}</p><p>申請較穩定的瀏覽器儲存可降低自動清除機率，但不能取代備份。</p><button className="secondary-button" onClick={requestPersistence}>申請永久儲存</button></div></section>
      <section className="panel setting-card danger"><span className="setting-icon">!</span><div><h2>清除全部資料</h2><p>永久移除這個瀏覽器中的全部錄音、照片與對帳紀錄。</p><button className="danger-button" onClick={async () => { if (confirm("確定清除全部資料？建議先匯出 ZIP 備份。")) { await dbClear(); await refresh(); flash("全部本機資料已清除。 "); } }}>清除本機資料</button></div></section></div>
      <section className="privacy-note"><strong>隱私設計</strong><span>網站不會把蒐證內容送往 GitHub。資料以網站來源為範圍保存在目前瀏覽器；更換裝置、瀏覽器或網址後不會自動出現。</span></section>
    </>;
  }

  const pages: Record<View, () => React.ReactNode> = { dashboard: Dashboard, record: RecordPage, photos: PhotoPage, ledger: LedgerPage, checkout: CheckoutPage, settings: SettingsPage };
  const CurrentPage = pages[view];

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><p>證據收銀台</p><h2>髒話收銀機</h2><span>職場霸凌蒐證管理工具</span></div><nav>{navItems.map((item) => <button key={item.id} aria-label={item.label} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav><div className="sidebar-safety"><span className="shield">▣</span><p>資料只存在本機裝置<br /><small>不自動上傳、不跨裝置同步</small></p></div></aside>
    <main className="main-content">{loading ? <div className="loading-ticket">正在開啟本機證據庫…</div> : <CurrentPage />}</main>
    {notice && <div className="toast" role="status">{notice}</div>}
    {activeRecord && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setActiveRecord(null)}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="編輯紀錄"><header><div><p className="eyebrow">ENTRY {shortId(activeRecord.id)}</p><h2>紀錄明細</h2></div><button className="close-button" onClick={() => setActiveRecord(null)}>×</button></header><MediaPreview record={activeRecord} /><label>紀錄標題<input value={activeRecord.title} onChange={(e) => setActiveRecord({ ...activeRecord, title: e.target.value })} /></label><label>發生時間<input type="datetime-local" value={new Date(new Date(activeRecord.createdAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setActiveRecord({ ...activeRecord, createdAt: new Date(e.target.value).toISOString() })} /></label><fieldset><legend>分類標籤</legend><div className="quick-tags">{QUICK_TAGS.map((tag) => <button type="button" key={tag} className={activeRecord.tags.includes(tag) ? "active" : ""} onClick={() => setActiveRecord({ ...activeRecord, tags: activeRecord.tags.includes(tag) ? activeRecord.tags.filter((item) => item !== tag) : [...activeRecord.tags, tag] })}>{tag}</button>)}</div></fieldset><label>內容與情境說明<textarea rows={5} placeholder="例如：發生地點、在場者、前後文、對方原話……" value={activeRecord.notes} onChange={(e) => setActiveRecord({ ...activeRecord, notes: e.target.value })} /></label>{activeRecord.markers?.length ? <div className="modal-markers"><strong>錄音時間標記</strong>{activeRecord.markers.map((m, i) => <span key={`${m.at}-${i}`}><b className="mono">{formatDuration(m.at)}</b>{m.tag}</span>)}</div> : null}<footer><button className="danger-link" onClick={() => removeRecord(activeRecord)}>刪除紀錄</button><div><button className="secondary-button" onClick={() => downloadBlob(activeRecord.blob, activeRecord.fileName)}>下載原始檔</button><button className="primary-button" onClick={saveActive}>儲存修改</button></div></footer></section></div>}
  </div>;
}
