import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_CATEGORIES, NAV_ITEMS } from "./constants";
import { buildBackup, parseBackup } from "./lib/backup";
import {
  clearAllData,
  deleteCategory,
  deleteRecord,
  getAllRecords,
  getCategories,
  putCategories,
  putRecord,
} from "./lib/db";
import { downloadBlob, fileOccurredAt, sha256 } from "./lib/files";
import { formatDate, formatDuration, makeId } from "./lib/format";
import type { CategoryDefinition, EvidenceRecord, View } from "./types";
import { calculateCategoryTotals, calculateLegacyAdjustments, categoryLabels } from "./lib/categories";
import { MediaPreview } from "./components/MediaPreview";
import { PageHeader } from "./components/PageHeader";
import { CategoryEditor } from "./components/CategoryEditor";
import { Recorder } from "./components/Recorder";
import { RecordModal } from "./components/RecordModal";
import { RecordsTable } from "./components/RecordsTable";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function Receipt({ records, categories, checkout = false }: { records: EvidenceRecord[]; categories: CategoryDefinition[]; checkout?: boolean }) {
  const audioCount = records.filter((record) => record.kind === "audio").length;
  const photoCount = records.filter((record) => record.kind === "photo").length;
  const totalDuration = records.reduce((total, record) => total + (record.duration || 0), 0);
  const categoryTotals = calculateCategoryTotals(records, categories);
  const legacyAdjustments = calculateLegacyAdjustments(records);
  const totalAmount = categoryTotals.reduce((total, item) => total + item.subtotal, 0) + legacyAdjustments.reduce((total, item) => total + item.amount, 0);
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
            <div><span>分類項目</span><strong>{categoryTotals.length}</strong></div>
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
      <div className="receipt-total"><span>{checkout ? "合計" : "對帳單總額"}</span><strong>NT$ {totalAmount.toLocaleString("zh-TW")}</strong></div>
      {checkout ? (
        <>
          <button className="dark-button" onClick={() => window.print()}>列印／另存 PDF</button>
          <p className="fine-print">本頁金額為使用者自行設定的紀錄統計，不代表法院、主管機關或法律規定的賠償認定。</p>
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

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [categories, setCategories] = useState<CategoryDefinition[]>(DEFAULT_CATEGORIES);
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
    await updateStorage();
  }, [updateStorage]);

  useEffect(() => {
    Promise.all([getAllRecords(), getCategories()])
      .then(([savedRecords, savedCategories]) => {
        setRecords(savedRecords);
        setCategories(savedCategories);
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
      `${record.title} ${record.notes} ${categoryLabels(record.categoryIds, categories).join(" ")}`.toLocaleLowerCase("zh-TW").includes(needle),
    );
  }, [query, records, categories]);

  async function saveRecord(record: EvidenceRecord) {
    await putRecord(record);
    await refresh();
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
      await putRecord({
        id: makeId("IMG"),
        kind: "photo",
        title: file.name.replace(/\.[^.]+$/, ""),
        occurredAt: fileOccurredAt(file),
        createdAt: new Date().toISOString(),
        tags: [],
        categoryIds: [],
        markers: [],
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
    const backup = await buildBackup(records, categories);
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
      setCategories(await getCategories());
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

  async function removeCategory(category: CategoryDefinition) {
    const affected = records.reduce((total, record) => total + (record.categoryIds.includes(category.id) ? 1 : 0) + (record.markers || []).filter((marker) => marker.categoryIds.includes(category.id)).length, 0);
    if (affected && !window.confirm(`「${category.name}」已套用在 ${affected} 個位置，刪除後會移除這些分類，確定繼續？`)) return;
    await deleteCategory(category);
    setCategories((current) => current.filter((item) => item.id !== category.id));
    await refresh();
    flash(`已刪除分類「${category.name}」。`);
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
          <Recorder onSave={saveRecord} flash={flash} />
          <Receipt records={records} categories={categories} />
        </div>
        <section className="panel recent-panel">
          <div className="section-title">
            <div><p className="eyebrow">RECENT ENTRIES</p><h2>最近紀錄</h2></div>
            <button className="text-button" onClick={() => setView("ledger")}>查看全部 →</button>
          </div>
          <RecordsTable records={records} categories={categories} limit={6} onOpen={setActiveRecord} />
        </section>
      </>
    );
  }

  function renderRecordPage() {
    return (
      <>
        <PageHeader title="對話錄音" subtitle="開始錄音或匯入既有音檔，錄音過程可即時加上快速時間標籤" />
        <Recorder onSave={saveRecord} flash={flash} />
        <section className="panel">
          <div className="section-title"><h2>錄音紀錄</h2>{searchInput("搜尋標題、標籤或備註")}</div>
          <RecordsTable records={filtered.filter((record) => record.kind === "audio")} categories={categories} onOpen={setActiveRecord} />
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
          <div className="section-title"><div><p className="eyebrow">EVIDENCE LEDGER</p><h2>全部蒐證紀錄</h2></div>{searchInput("搜尋全部紀錄")}</div>
          <RecordsTable records={filtered} categories={categories} onOpen={setActiveRecord} />
        </section>
      </>
    );
  }

  function renderCheckoutPage() {
    const totals = calculateCategoryTotals(records, categories);
    const legacyAdjustments = calculateLegacyAdjustments(records);
    const categoryTotal = totals.reduce((total, item) => total + item.subtotal, 0);
    const legacyTotal = legacyAdjustments.reduce((total, item) => total + item.amount, 0);
    return (
      <>
        <PageHeader title="結帳台" subtitle="依分類標籤與計價規則自動統計蒐證資料" />
        <div className="checkout-layout">
          <section className="panel">
            <div className="section-title"><div><p className="eyebrow">CATEGORY TOTALS</p><h2>分類小計</h2></div><span>{records.length} 筆證據</span></div>
            <div className="checkout-list">
              {totals.map((item) => (
                <div className="checkout-category-row" key={item.id}>
                  <div><strong>{item.name}</strong><small>{item.count} 次 · {item.billingMode === "per-occurrence" ? "每次出現" : "每筆證據一次"}</small></div>
                  <span className="mono">NT$ {item.unitPrice.toLocaleString("zh-TW")}</span>
                  <strong className="checkout-subtotal">NT$ {item.subtotal.toLocaleString("zh-TW")}</strong>
                </div>
              ))}
              {legacyAdjustments.length > 0 && (
                <>
                  <div className="checkout-divider">舊版調整項</div>
                  {legacyAdjustments.map((item) => <div className="checkout-category-row legacy-row" key={item.id}><div><strong>{item.title}</strong><small>升級前手動金額</small></div><span>1 次</span><strong className="checkout-subtotal">NT$ {item.amount.toLocaleString("zh-TW")}</strong></div>)}
                </>
              )}
            </div>
            {!totals.length && !legacyAdjustments.length && <div className="empty-state">尚無已分類或舊版計價紀錄</div>}
            <div className="checkout-grand-total"><span>總計</span><strong>NT$ {(categoryTotal + legacyTotal).toLocaleString("zh-TW")}</strong></div>
          </section>
          <Receipt records={records} categories={categories} checkout />
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
            <span className="setting-icon">ZIP</span>
            <div><h2>完整備份與還原</h2><p>備份包含錄音、照片、標籤、備註、自訂金額與檔案雜湊值。</p><div className="button-row"><button className="primary-button" onClick={exportBackup}>匯出 ZIP 備份</button><button className="secondary-button" onClick={() => backupInput.current?.click()}>從 ZIP 還原</button><input ref={backupInput} hidden type="file" accept=".zip,application/zip" onChange={restoreBackup} /></div></div>
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
            <div><h2>清除全部資料</h2><p>永久移除這個瀏覽器中的全部錄音、照片、分類與對帳紀錄。</p><button className="danger-button" onClick={async () => { if (window.confirm("確定清除全部資料？建議先匯出 ZIP 備份。")) { await clearAllData(); setCategories([]); await refresh(); flash("全部本機資料已清除。"); } }}>清除本機資料</button></div>
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
          record={activeRecord}
          categories={categories}
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
