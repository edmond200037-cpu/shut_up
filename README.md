# 髒話收銀機

可部署於 GitHub Pages 的全中文、本機優先職場不當言行蒐證工具。網站本身是靜態檔案；錄音、照片、標籤、備註及金額都保存在目前瀏覽器的 IndexedDB，不會寫入 GitHub Repository。

## 已完成的功能

- 麥克風錄音、暫停、繼續、停止與錄音中快速時間標籤
- 對帳單錄音時間軸、標籤前 10 秒預覽及辱罵／恐嚇／霸凌等即時分類
- 匯入音檔與照片，優先採用檔案可用日期作為發生時間
- SHA-256 檔案雜湊值、原始檔下載、紀錄編輯與搜尋
- 共用分類標籤，可套用於照片、錄音與其他證據
- 分類單價、每次出現／每筆證據一次計價規則與分類結帳台
- 舊版逐筆金額會以調整項保留在結帳台
- IndexedDB 本機儲存、儲存持久化申請
- ZIP 完整備份與還原
- PWA 安裝、應用程式外殼離線快取
- GitHub Actions 自動部署 GitHub Pages

## 專案架構

```text
src/
├─ components/       畫面元件（錄音器、表格、編輯視窗）
├─ lib/              IndexedDB、ZIP、雜湊與格式化工具
├─ App.tsx           頁面狀態與功能整合
├─ main.tsx          網站進入點與 Service Worker 註冊
├─ styles.css        票據工業風與響應式樣式
└─ types.ts          蒐證資料模型
public/
├─ manifest.webmanifest
├─ sw.js
└─ favicon.svg
.github/workflows/deploy-pages.yml
```

此架構不使用後端、資料庫伺服器、Next.js SSR 或特定雲端執行環境，建置後只產生 `dist/` 靜態檔案。Vite 使用相對資源路徑，因此 Repository 改名後仍可部署到對應的 Pages 子路徑。

## 本機啟動

需求：Node.js 22.13 以上。

```bash
npm ci
npm run dev
```

麥克風功能需要 HTTPS 或 `localhost`。直接雙擊 HTML 以 `file://` 開啟，不保證能錄音或使用 Service Worker。

## 檢查與建置

```bash
npm run check
```

通過後，靜態網站位於 `dist/`。

## 發布到 GitHub Pages

1. 將程式推送到 `main` 分支。
2. Repository → **Settings** → **Pages**。
3. 將 **Source** 選為 **GitHub Actions**。
4. 等待「部署 GitHub Pages」工作流程完成。

本 Repository 的預期網址：

`https://edmond200037-cpu.github.io/shut_up/`

## 重要提醒

- GitHub Pages 只公開網站程式，不會公開使用者的錄音與照片。
- 不同裝置、瀏覽器或網站來源各有獨立資料庫，不會自動同步。
- 清除網站資料、使用無痕模式或瀏覽器回收空間可能造成紀錄遺失，請定期匯出 ZIP 備份。
- 手機鎖定螢幕、切到背景或被系統終止時，錄音可能中斷。
- 本工具只協助整理個人紀錄，不會自動判定是否構成職場霸凌，也不取代法律或主管機關意見。
