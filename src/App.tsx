import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_CATEGORIES, NAV_ITEMS } from "./constants";
import { buildBackup, parseBackup } from "./lib/backup";
import {
  clearAllData,
  deleteCategory,
  deletePerson,
  deleteRecord,
  getAllRecords,
  getCategories,
  getPeople,
  putPeople,
  putCategories,
  putRecord,
} from "./lib/db";
import { downloadBlob, fileOccurredAt, sha256 } from "./lib/files";
import { formatDate, formatDuration, makeId } from "./lib/format";
import type { CategoryDefinition, EvidenceRecord, PersonDefinition, View } from "./types";
import { calculatePersonTotals, categoryIdsForRecord, categoryLabels, personIdsForRecord, personName } from "./lib/categories";
import { buildReceiptLines, summarizeReceiptLines, type ReceiptLine } from "./lib/receipts";
import { MediaPreview } from "./components/MediaPreview";
import { PageHeader } from "./components/PageHeader";
import { CategoryEditor } from "./components/CategoryEditor";
import { Recorder } from "./components/Recorder";
import { RecordModal } from "./components/RecordModal";
import { RecordsTable } from "./components/RecordsTable";
import { PersonEditor } from "./components/PersonEditor";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function escapePrintText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function openPrintWindow(title: string, content: string, flash: (message: string) => void) {
  const popup = window.open("", "_blank", "width=900,height=900");
  if (!popup) return flash("瀏覽器阻擋了列印視窗，請允許此網站開啟彈出視窗。");
  popup.opener = null;
  popup.document.write(`<!doctype html><html lang="zh-Hant-TW"><head><meta charset="UTF-8"><title>${escapePrintText(title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#171812;font-family:system-ui,"Noto Sans TC",sans-serif;padding:32px}main{max-width:820px;margin:0 auto}h1{font-size:28px;margin:0 0 6px}h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid #171812;padding-bottom:8px}.meta{color:#656052;font-size:12px;margin-bottom:24px}.line,.summary-line{display:grid;grid-template-columns:minmax(0,1fr) 130px 150px;gap:14px;padding:14px 0;border-bottom:1px dashed #aaa28e}.line small,.summary-line small{display:block;color:#686151;margin-top:4px}.amount{text-align:right;font-weight:800}.total{display:flex;justify-content:space-between;border-top:3px solid #171812;margin-top:18px;padding-top:16px;font-size:20px;font-weight:900}@media print{body{padding:12mm}button{display:none}}
  </style></head><body><main>${content}</main><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  popup.document.close();
}

function printSummary(personNameValue: string, lines: ReceiptLine[], flash: (message: string) => void) {
  const summary = summarizeReceiptLines(lines);
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const rows = summary.map((item) => `<div class="summary-line"><div><strong>${escapePrintText(item.categoryName)}</strong><small>${item.count} 次 · 單價 NT$ ${item.unitPrice.toLocaleString("zh-TW")}</small></div><span></span><strong class="amount">NT$ ${item.subtotal.toLocaleString("zh-TW")}</strong></div>`).join("");
  openPrintWindow(`${personNameValue}－結帳摘要`, `<h1>人物結帳摘要</h1><p class="meta">人物：${escapePrintText(personNameValue)}</p>${rows || "<p>尚無可計價證據。</p>"}<div class="total"><span>人物小計</span><span>NT$ ${total.toLocaleString("zh-TW")}</span></div>`, flash);
}

function printDetails(personNameValue: string, lines: ReceiptLine[], flash: (message: string) => void) {
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const rows = lines.map((line) => `<div class="line"><div><strong>${escapePrintText(line.categoryName)}</strong><small>人物：${escapePrintText(line.personName)}<br>來源檔案：${escapePrintText(line.sourceFile)}<br>位置：${escapePrintText(line.position)}</small></div><span></span><strong class="amount">NT$ ${line.amount.toLocaleString("zh-TW")}</strong></div>`).join("");
  openPrintWindow(`${personNameValue}－明細收據`, `<h1>人物明細收據</h1><p class="meta">人物：${escapePrintText(personNameValue)}</p>${rows || "<p>尚無可計價證據。</p>"}<div class="total"><span>人物小計</span><span>NT$ ${total.toLocaleString("zh-TW")}</span></div>`, flash);
}

function Receipt({ records, categories, people, checkout = false }: { records: EvidenceRecord[]; categories: CategoryDefinition[]; people: PersonDefinition[]; checkout?: boolean }) {
  const audioCount = records.filter((record) => record.kind === "audio").length;
  const photoCount = records.filter((record) => record.kind === "photo").length;
  const totalDuration = records.reduce((total, record) => total + (record.duration || 0), 0);
  const personTotals = calculatePersonTotals(records, categories, people);
  const totalAmount = personTotals.reduce((total, item) => total + item.subtotal, 0);
  const today = new Date().toLocaleDateString("zh-TW");
  const todayRecords = records.filter((record) => new Date(record.occurredAt).toLocaleDateString("zh-TW") === today);

  return (
    <aside className={`receipt-card ${checkout ? "checkout-receipt" : ""}`}>
      <div className="receipt-teeth top" />
      <p className="eyebrow">{checkout ? "CHECKOUT RECEIPT" : "DAILY RECEIPT"}</p>
      <h2>{checkout ? "結帳摘要" : "今日摘要"}</h2>
      <div className="receipt-lines">
        {checkout ? (
          <>
            <div><span>人物</span><strong>{personTotals.length}</strong></div>
            <div><span>錄音</span><strong>{audioCount} 筆</strong></div>
            <div><span>照片</span><strong>{photoCount} 張</strong></div>
          </>
        ) : (
          <>
            <div><span>日期</span><strong>{today}</strong></div>
            <div><span>今日錄音</span><strong>{todayRecords.filter((record) => record.kind === "audio").length} 筆</strong></div>
            <div><span>今日照片</span><strong>{todayRecords.filter((record) => record.kind === "photo").length} 張</strong></div>
            <div><span>全部錄音時長</span><strong>{formatDuration(totalDuration)}</strong></div>
            <div><span>待補充說明</span><strong>{records.filter((record) => !record.notes).length} 筆</strong></div>
          </>
        )}
      </div>
      <div className="receipt-total"><span>{checkout ? "全部總計" : "對帳單總額"}</span><strong>NT$ {totalAmount.toLocaleString("zh-TW")}</strong></div>
      {checkout ? (
        <>
          <p className="fine-print">請使用左側人物列的「匯出摘要」或「另存 PDF」，列印內容只會包含該人物。</p>
        </>
      ) : (
        <>
          <p className="receipt-number mono">RCPT-{new Date().toISOString().slice(0, 10).replaceAll("-", "")}-{String(records.length + 1).padStart(3, "0")}</p>
          <div className="barcode" />
        </>
      )}
      <div className="receipt-teeth bottom" />
    </aside>
  );
}

function PersonSummary({ records, categories, people }: { records: EvidenceRecord[]; categories: CategoryDefinition[]; people: PersonDefinition[] }) {
  const totals = calculatePersonTotals(records, categories, people);
  return <div className="person-summary-grid">{totals.length ? totals.map((group) => <div className="person-summary-card" key={group.personId || "unassigned"}><div><strong>{group.name}</strong><span>小計 NT$ {group.subtotal.toLocaleString("zh-TW")}</span></div><p>{group.categories.map((category) => `${category.name} ${category.count}次`).join(" · ") || "尚無分類"}</p></div>) : <p className="muted">尚無人物分類金額。</p>}</div>;
}

function PersonCheckoutList({
  totals,
  records,
  categories,
  people,
  flash,
}: {
  totals: ReturnType<typeof calculatePersonTotals>;
  records: EvidenceRecord[];
  categories: CategoryDefinition[];
  people: PersonDefinition[];
  flash: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(totals[0]?.personId || "__unassigned__");
  return <>{totals.map((group) => {
    const groupKey = group.personId || "__unassigned__";
    const lines = buildReceiptLines(records, categories, people, group.personId);
    const isExpanded = expanded === groupKey;
    return <div className="person-checkout-group" key={groupKey}>
      <div className="person-checkout-header">
        <button type="button" className="person-expand-button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : groupKey)}><span>{isExpanded ? "⌄" : "›"}</span><strong>👤 {group.name}</strong><em>NT$ {group.subtotal.toLocaleString("zh-TW")}</em></button>
        <div className="person-export-actions"><button type="button" className="secondary-button" onClick={() => printSummary(group.name, lines, flash)}>匯出摘要</button><button type="button" className="dark-button compact-button" onClick={() => printDetails(group.name, lines, flash)}>另存 PDF</button></div>
      </div>
      {isExpanded && <div className="person-checkout-details">{group.categories.map((item) => <div className="checkout-category-row" key={item.id}><div><strong>{item.name}</strong><small>{item.count} 次 · {item.billingMode === "per-occurrence" ? "每次出現" : "每人每檔一次"}</small></div><span className="mono">NT$ {item.unitPrice.toLocaleString("zh-TW")}</span><strong className="checkout-subtotal">NT$ {item.subtotal.toLocaleString("zh-TW")}</strong></div>)}{group.legacyTotal > 0 && <div className="checkout-category-row legacy-row"><div><strong>舊版調整項</strong><small>未指定人物</small></div><span>1 次</span><strong className="checkout-subtotal">NT$ {group.legacyTotal.toLocaleString("zh-TW")}</strong></div>}</div>}
    </div>;
  })}</>;
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>(DEFAULT_CATEGORIES);
  const [people, setPeople] = useState<PersonDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [activeRecord, setActiveRecord] = useState<EvidenceRecord | null>(null);
  const [storageText, setStorageText] = useState("計算中…");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((message: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4_200);
  }, []);

  const updateStorage = useCallback(async () => {
    if (!navigator.storage?.estimate) {
      setStorageText("瀏覽器未提供容量資訊");
      return;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    setStorageText(`已使用 ${(usage / 1024 / 1024).toFixed(1)} MB／可用約 ${(quota / 1024 / 1024 / 1024).toFixed(1)} GB`);
  }, []);

  const refresh = useCallback(async () => {
    setRecords(await getAllRecords());
    setPeople(await getPeople());
    await updateStorage();
  }, [updateStorage]);

  useEffect(() => {
    Promise.all([getAllRecords(), getCategories(), getPeople()])
      .then(([savedRecords, savedCategories, savedPeople]) => {
        setRecords(savedRecords);
        setCategories(savedCategories);
        setPeople(savedPeople);
      })
      .catch(() => flash("無法讀取本機資料庫，請確認瀏覽器未停用網站儲存。"))
      .finally(() => setLoading(false));
    window.queueMicrotask(() => void updateStorage());
  }, [flash, updateStorage]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("zh-TW");
    if (!needle) return records;
    return records.filter((record) =>
      `${record.title} ${record.notes} ${categoryLabels(categoryIdsForRecord(record), categories).join(" ")} ${personIdsForRecord(record).map((id) => personName(id, people)).join(" ")}`.toLocaleLowerCase("zh-TW").includes(needle),
    );
  }, [query, records, categories, people]);

  async function saveRecord(record: EvidenceRecord) {
    await putRecord(record);
    await refresh();
  }

  async function importAudioRecord(record: EvidenceRecord) {
    await saveRecord(record);
    setActiveRecord(record);
    flash("音檔已加入，請先播放並建立快速標籤。");
  }

  async function saveModalRecord(record: EvidenceRecord) {
    await saveRecord(record);
    setActiveRecord(null);
    flash("紀錄已更新。");
  }

  async function removeRecord(record: EvidenceRecord) {
    if (!window.confirm(`確定刪除「${record.title}」？此操作無法復原。`)) return;
    await deleteRecord(record.id);
    setActiveRecord(null);
    await refresh();
    flash("紀錄已刪除。");
  }

  async function importPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      const id = makeId("IMG");
      await putRecord({
        id,
        kind: "photo",
        title: file.name.replace(/\.[^.]+$/, ""),
        occurredAt: fileOccurredAt(file),
        createdAt: new Date().toISOString(),
        tags: [],
        categoryIds: [],
        markers: [],
        audioWorkflowStage: "classifying",
        legacyWholeAssignmentPending: false,
        personId: null,
        photoItems: [{ id: `${id}-EVIDENCE-1`, personId: null, categoryIds: [] }],
        notes: "發生時間先採用檔案可用日期，可在明細中修改。",
        mime: file.type || "image/jpeg",
        fileName: file.name,
        fileSize: file.size,
        sha256: await sha256(file),
        blob: file,
      });
    }
    event.target.value = "";
    await refresh();
    if (files.length) flash(`已加入 ${files.length} 張照片。`);
  }

  async function exportBackup() {
    if (!records.length && !window.confirm("目前沒有蒐證紀錄，仍要匯出只有設定的備份嗎？")) return;
    const backup = await buildBackup(records, categories, people);
    downloadBlob(backup, `髒話收銀機備份-${new Date().toISOString().slice(0, 10)}.zip`);
    flash("完整 ZIP 備份已匯出，請妥善保存。");
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { files, manifest } = parseBackup(await file.arrayBuffer());
      let restored = 0;
      for (const item of manifest.records) {
        const bytes = files.get(item.mediaPath);
        if (!bytes) continue;
        const { mediaPath: _mediaPath, ...metadata } = item;
        void _mediaPath;
        await putRecord({
          ...metadata,
          blob: new Blob([bytes.slice().buffer], { type: item.mime }),
        });
        restored += 1;
      }
      await putCategories(manifest.categories);
      await putPeople(manifest.people);
      setCategories(await getCategories());
      setPeople(await getPeople());
      await refresh();
      flash(`已還原 ${restored} 筆紀錄；相同編號會更新，不會重複。`);
    } catch (error) {
      flash(`還原失敗：${error instanceof Error ? error.message : "檔案無法讀取"}`);
    }
  }

  async function saveCategories(next: CategoryDefinition[]) {
    const normalized = next
      .filter((category) => category.name.trim())
      .map((category) => ({ ...category, name: category.name.trim(), unitPrice: Math.max(0, Math.round(category.unitPrice || 0)) }));
    await putCategories(normalized);
    setCategories(normalized);
  }

  async function savePeople(next: PersonDefinition[]) {
    const normalized = next
      .map((person) => ({ ...person, name: person.name.trim() }))
      .filter((person, index, all) => person.name && all.findIndex((item) => item.name === person.name) === index);
    await putPeople(normalized);
    setPeople(normalized);
  }

  async function removeCategory(category: CategoryDefinition) {
    const affected = records.reduce((total, record) => total + (record.categoryIds.includes(category.id) ? 1 : 0) + (record.markers || []).filter((marker) => marker.categoryIds.includes(category.id)).length + (record.photoItems || []).filter((item) => item.categoryIds.includes(category.id)).length, 0);
    if (affected && !window.confirm(`「${category.name}」已套用在 ${affected} 個位置，刪除後會移除這些分類，確定繼續？`)) return;
    await deleteCategory(category);
    setCategories((current) => current.filter((item) => item.id !== category.id));
    await refresh();
    flash(`已刪除分類「${category.name}」。`);
  }

  async function removePerson(person: PersonDefinition) {
    const affected = records.reduce((total, record) => total + (record.personId === person.id ? 1 : 0) + (record.markers || []).filter((marker) => marker.personId === person.id).length + (record.photoItems || []).filter((item) => item.personId === person.id).length, 0);
    if (affected && !window.confirm(`「${person.name}」已套用在 ${affected} 個證據位置，刪除後會改為未指定，確定繼續？`)) return;
    await deletePerson(person);
    setPeople((current) => current.filter((item) => item.id !== person.id));
    await refresh();
    flash(`已刪除人物「${person.name}」，既有證據已改為未指定。`);
  }

  async function requestPersistence() {
    if (!navigator.storage?.persist) return flash("此瀏覽器不支援永久儲存申請。");
    const granted = await navigator.storage.persist();
    flash(granted ? "瀏覽器已允許較穩定地保留資料。" : "瀏覽器未授予永久儲存；請定期匯出 ZIP 備份。");
  }

  async function installApp() {
    if (!installPrompt) return flash("若未出現安裝按鈕，請使用瀏覽器選單的「安裝應用程式／加入主畫面」。");
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  function renderDashboard() {
    return (
      <>
        <PageHeader title="總覽" subtitle="快速記錄、核對與整理今日蒐證資料" />
        <div className="dashboard-grid">
          <Recorder onSave={saveRecord} onImport={importAudioRecord} flash={flash} />
          <Receipt records={records} categories={categories} people={people} />
        </div>
        <section className="panel recent-panel">
          <div className="section-title">
            <div><p className="eyebrow">RECENT ENTRIES</p><h2>最近紀錄</h2></div>
            <button className="text-button" onClick={() => setView("ledger")}>查看全部 →</button>
          </div>
          <RecordsTable records={records} categories={categories} people={people} limit={6} onOpen={setActiveRecord} />
        </section>
      </>
    );
  }

  function renderRecordPage() {
    return (
      <>
        <PageHeader title="對話錄音" subtitle="開始錄音或匯入既有音檔，錄音過程可即時加上快速時間標籤" />
        <Recorder onSave={saveRecord} onImport={importAudioRecord} flash={flash} />
        <section className="panel">
          <div className="section-title"><h2>錄音紀錄</h2>{searchInput("搜尋標題、標籤或備註")}</div>
          <RecordsTable records={filtered.filter((record) => record.kind === "audio")} categories={categories} people={people} onOpen={setActiveRecord} />
        </section>
      </>
    );
  }

  function searchInput(placeholder: string) {
    return <input className="search-input" placeholder={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} />;
  }

  function renderPhotoPage() {
    const photos = filtered.filter((record) => record.kind === "photo");
    return (
      <>
        <PageHeader title="照片紀錄" subtitle="加入現場照片、截圖或文件影像，並補上來源與說明" />
        <section className="upload-zone" onClick={() => photoInput.current?.click()}>
          <span className="upload-symbol">＋</span><h2>新增照片紀錄</h2>
          <p>點擊選擇照片，可一次加入多張；原始檔只保存在本機</p>
          <button className="primary-button">選擇照片</button>
          <input ref={photoInput} hidden type="file" accept="image/*" multiple onChange={importPhotos} />
        </section>
        <section className="panel">
          <div className="section-title"><h2>照片資料</h2>{searchInput("搜尋照片紀錄")}</div>
          <div className="photo-grid">
            {photos.map((record) => (
              <button className="photo-card" key={record.id} onClick={() => setActiveRecord(record)}>
                <MediaPreview record={record} />
                <span><strong>{record.title}</strong><small>{formatDate(record.occurredAt)}</small></span>
              </button>
            ))}
          </div>
          {!photos.length && <div className="empty-state">尚未加入照片紀錄</div>}
        </section>
      </>
    );
  }

  function renderLedgerPage() {
    return (
      <>
        <PageHeader title="對話對帳單" subtitle="逐筆補充內容、分類標籤與備註，建立可核對的時間序列" />
        <section className="panel">
          <div className="section-title"><div><p className="eyebrow">PERSON LEDGER</p><h2>人物對帳摘要</h2></div><span>先在紀錄內選人物，再套用分類</span></div>
          <PersonSummary records={records} categories={categories} people={people} />
        </section>
        <section className="panel">
          <div className="section-title"><div><p className="eyebrow">EVIDENCE LEDGER</p><h2>全部蒐證紀錄</h2></div>{searchInput("搜尋全部紀錄")}</div>
          <RecordsTable records={filtered} categories={categories} people={people} onOpen={setActiveRecord} />
        </section>
      </>
    );
  }

  function renderCheckoutPage() {
    const personTotals = calculatePersonTotals(records, categories, people);
    const totalAmount = personTotals.reduce((total, item) => total + item.subtotal, 0);
    return (
      <>
        <PageHeader title="結帳台" subtitle="依人物、分類標籤與計價規則自動統計蒐證資料" />
        <div className="checkout-layout">
          <section className="panel">
            <div className="section-title"><div><p className="eyebrow">PERSON TOTALS</p><h2>人物結帳</h2></div><span>{records.length} 筆證據</span></div>
            <div className="checkout-list">
              <PersonCheckoutList totals={personTotals} records={records} categories={categories} people={people} flash={flash} />
            </div>
            {!personTotals.length && <div className="empty-state">尚無已分類或舊版計價紀錄</div>}
            <div className="checkout-grand-total"><span>全部總計</span><strong>NT$ {totalAmount.toLocaleString("zh-TW")}</strong></div>
          </section>
          <Receipt records={records} categories={categories} people={people} checkout />
        </div>
      </>
    );
  }

  function renderSettingsPage() {
    return (
      <>
        <PageHeader title="設定" subtitle="管理共用分類、單價、計價規則、備份與裝置儲存狀態" />
        <div className="settings-grid">
          <section className="panel setting-card">
            <span className="setting-icon">TAG</span>
            <div><h2>分類標籤</h2><p>照片、錄音與其他證據共用同一套分類；每個分類可設定單價與重複計價方式。</p><CategoryEditor categories={categories} onChange={saveCategories} onDelete={removeCategory} flash={flash} /></div>
          </section>
          <section className="panel setting-card">
            <span className="setting-icon">WHO</span>
            <div><h2>人物管理</h2><p>建立共用人物清單，錄音快速標籤與照片證據都能直接選用。</p><PersonEditor people={people} onChange={savePeople} onDelete={removePerson} flash={flash} /></div>
          </section>
          <section className="panel setting-card">
            <span className="setting-icon">ZIP</span>
            <div><h2>完整備份與還原</h2><p>備份包含錄音、照片、人物、分類、備註、自訂金額與檔案雜湊值。</p><div className="button-row"><button className="primary-button" onClick={exportBackup}>匯出 ZIP 備份</button><button className="secondary-button" onClick={() => backupInput.current?.click()}>從 ZIP 還原</button><input ref={backupInput} hidden type="file" accept=".zip,application/zip" onChange={restoreBackup} /></div></div>
          </section>
          <section className="panel setting-card">
            <span className="setting-icon">APP</span>
            <div><h2>安裝與離線</h2><p>{isOnline ? "目前已連線；安裝後可從桌面或手機主畫面開啟。" : "目前離線；已快取的網站功能仍可使用。"}</p><button className="secondary-button" onClick={installApp}>安裝到裝置</button></div>
          </section>
          <section className="panel setting-card">
            <span className="setting-icon">SSD</span>
            <div><h2>本機儲存</h2><p>{storageText}</p><p>申請較穩定的瀏覽器儲存可降低自動清除機率，但不能取代備份。</p><button className="secondary-button" onClick={requestPersistence}>申請永久儲存</button></div>
          </section>
          <section className="panel setting-card danger">
            <span className="setting-icon">!</span>
            <div><h2>清除全部資料</h2><p>永久移除這個瀏覽器中的全部錄音、照片、人物、分類與對帳紀錄。</p><button className="danger-button" onClick={async () => { if (window.confirm("確定清除全部資料？建議先匯出 ZIP 備份。")) { await clearAllData(); setCategories([]); setPeople([]); await refresh(); flash("全部本機資料已清除。"); } }}>清除本機資料</button></div>
          </section>
        </div>
        <section className="privacy-note"><strong>隱私設計</strong><span>網站不會把蒐證內容送往 GitHub。資料以網站來源為範圍保存在目前瀏覽器；更換裝置、瀏覽器或網址後不會自動出現。</span></section>
      </>
    );
  }

  const currentPage = {
    dashboard: renderDashboard,
    record: renderRecordPage,
    photos: renderPhotoPage,
    ledger: renderLedgerPage,
    checkout: renderCheckoutPage,
    settings: renderSettingsPage,
  }[view]();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><p>證據收銀台</p><h2>髒話收銀機</h2><span>職場不當言行蒐證管理工具</span></div>
        <nav aria-label="主要功能">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} aria-label={item.label} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setQuery(""); }}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-safety"><span className="shield">▣</span><p>資料只存在本機裝置<br /><small>{isOnline ? "不自動上傳、不跨裝置同步" : "離線模式仍可開啟已快取功能"}</small></p></div>
      </aside>

      <main className="main-content">
        {loading ? <div className="loading-ticket">正在開啟本機證據庫…</div> : currentPage}
      </main>

      {notice && <div className="toast" role="status">{notice}</div>}
      {activeRecord && (
        <RecordModal
          key={activeRecord.id}
          record={activeRecord}
          categories={categories}
          people={people}
          onClose={() => setActiveRecord(null)}
          onSave={saveModalRecord}
          onUpdate={async (record) => {
            await saveRecord(record);
            setActiveRecord(record);
          }}
          onDelete={removeRecord}
          flash={flash}
        />
      )}
    </div>
  );
}
