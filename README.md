# 髒話收銀機

全中文、裝置本機優先的職場霸凌蒐證管理網站。可錄音、匯入音檔與照片、加入時間標記與分類、整理對話對帳單、自訂結帳金額，以及匯出／還原完整 ZIP 備份。

## 隱私與資料位置

- 錄音、照片與紀錄儲存在目前瀏覽器的 IndexedDB。
- GitHub Pages 只提供網站程式，不會收到使用者的蒐證資料。
- 不同瀏覽器、裝置或網站網址各有獨立資料庫，不會自動同步。
- 清除瀏覽器網站資料可能造成紀錄遺失，請定期匯出 ZIP 備份。

## 本機啟動

需求：Node.js 22.13 以上。

```bash
npm ci
npm run dev
```

麥克風功能需要 HTTPS 或 localhost。直接雙擊 HTML、以 `file://` 開啟時，不保證可使用錄音。

## 發布到 GitHub Pages

專案已包含 `.github/workflows/deploy-pages.yml`。將程式推送到 GitHub 的 `main` 分支後：

1. 進入 Repository 的 `Settings`。
2. 選擇 `Pages`。
3. 將 `Source` 設為 `GitHub Actions`。
4. 重新執行「部署 GitHub Pages」工作流程，或再次推送更新。

工作流程會自動辨識專案型 Pages 路徑，例如 `https://帳號.github.io/儲存庫名稱/`。

## 使用提醒

本工具用於整理個人紀錄，不會自動判定是否構成職場霸凌，也不取代律師、工會、主管機關或其他專業意見。錄音前應確認所在地法律與工作場所規範。
