# 價格標籤同步問題規劃

## 意圖摘要
把「設定頁已儲存價格項目，但錄音頁與圖片頁的詳細標籤沒有出現」這件事，從猜測拉成可直接執行的修正計畫。這份文件現在聚焦的是跨頁同步，而不是設定頁本身能不能存成功。

## 本輪新增結論

### 已確認不是儲存 key 不一致
- `settings.html` 儲存價格標籤使用：
  - `swear-word-cash-register.price-labels.v1`
- `app.js` 讀取價格標籤使用：
  - `swear-word-cash-register.price-labels.v1`
- 結論：**設定頁、錄音頁、圖片頁其實都指向同一份本地資料。**

### 已確認錄音頁與圖片頁都會讀價格標籤
- `recording.html` 的詳細標籤列表由 `app.js` 的 `initRecordingPage()` 產生
- `image-new.html` 的詳細標籤列表由 `app.js` 的 `initImagePage()` 產生
- 兩邊都不是寫死選項，而是透過 `getActiveLabels()` 從 `appState.priceLabels` 取資料

### 目前最可能根因
- `app.js` 只在頁面載入時做一次 `loadAppState()`
- `appState.priceLabels` 載入後就留在記憶體裡
- 如果你先開著錄音頁或圖片頁，再去設定頁新增價格項目，那兩頁**不會自動重新同步**
- 所以會出現：
  - 設定頁看得到已儲存
  - 詳細標籤區卻還是舊的
  - 重整錄音頁 / 圖片頁後，通常就會出現

## 目前判定的根因

### 根因 A：詳細標籤頁面只在初次載入時讀一次價格標籤
機率最高，且已經有程式證據支持。

支持理由：
- `settings.html` 寫入 standalone price labels key 沒有偏掉
- `recording.html` 與 `image-new.html` 不是直接讀 localStorage，而是讀已初始化過的 `appState`
- 目前沒有看到：
  - `storage` 事件同步
  - `visibilitychange` 後重新抓取
  - 每次 render 前重新同步 standalone labels

會看到的表現：
- 新增完價格項目後，設定頁列表正常
- 回到錄音或圖片頁，詳細標籤仍是舊內容
- 手動重新整理後才出現新標籤

### 根因 B：舊頁面記憶體狀態沒有被覆蓋
這其實是根因 A 的延伸，不是另一套資料結構問題。

會看到的表現：
- 同一個瀏覽工作階段裡，設定頁與其他頁面顯示不一致
- 只要整頁 reload，狀態就重新對齊

## 目前已鎖定的程式狀態

### 設定頁目前已是獨立控制器
- `settings.html` 主容器帶有 `data-settings-standalone="true"`
- `app.js` 的 `initSettingsPage()` 遇到這個標記會直接 return
- 代表設定頁價格標籤功能，理論上只由 `settings.html` 頁尾腳本接手

### 價格表的寫入 key 已固定
- 使用的本地 key 是：
  - `swear-word-cash-register.price-labels.v1`
- `settings.html` 與 `app.js` 都指向同一個 key

### source 內的 submit 流程本身完整
目前 `settings.html` 的表單 submit 路徑包含：
1. 阻止預設送出
2. 驗證 `labelName`
3. 驗證 `amount`
4. 讀取現有 labels
5. 新增或更新 label
6. `saveLabels(labelsState)`
7. `resetForm()`
8. `render()`
9. 顯示 toast

結論：**設定頁的存檔流程目前不是主問題；主問題是其他頁面沒有在適當時機重新同步這份價格標籤。**

## 歷史錯誤回顧

### 歷史錯誤 1：雙重 submit 邏輯互相干擾
之前同時存在：
- form inline `onsubmit`
- 頁尾 `addEventListener("submit", ...)`

這會導致：
- 同一個動作被兩套邏輯搶著處理
- 列表更新與狀態重設不一致
- 看起來像「按了沒用」

目前 source 已移除這個衝突。

### 歷史錯誤 2：設定頁控制權分散在 `app.js` 與 `settings.html`
之前追錯時，容易出現：
- 修了 `app.js`，但實際跑的是 `settings.html`
- 或相反

目前設計方向已經收斂成：
- `settings.html` 自己管理價格表
- `app.js` 對這頁不再主導

## 下一輪執行計畫

### Phase 1：補價格標籤重新同步函式
在 `app.js` 補一個明確的同步入口，例如：
- 每次 render 詳細標籤前，先把 standalone labels 重新讀回 `appState.priceLabels`
- 或抽成 `syncPriceLabelsFromStandalone()` 給錄音頁、圖片頁共用

目的：
- 讓錄音頁與圖片頁不要只依賴第一次載入時的記憶體快照

### Phase 2：補頁面回前景時的二次同步
建議至少補其中一種：
1. `visibilitychange`
2. `focus`
3. 回到頁面時重跑標籤 render

收集證據：
- 在設定頁新增價格項目
- 不手動整頁重整
- 回到錄音頁 / 圖片頁時，詳細標籤是否立刻更新

### Phase 3：按證據決定修正方向

#### 若補同步後立即正常
修正方向：
- 代表根因已確認為跨頁同步缺口
- 下一步只需把同步點收斂成可維護做法

#### 若補同步後仍沒有標籤
修正方向：
- 再往下查 DOM selector 與 active filter
- 檢查是否有舊資料把 `isActive` 存成 `false`
- 檢查對應容器是否被其他流程覆蓋

## 建議採用方案
建議下一輪執行：

1. 先改 `app.js`
2. 不先動 `settings.html` 的儲存流程
3. 先讓錄音頁與圖片頁在 render 前重新同步價格標籤
4. 再驗證是否還需要額外的頁面回前景 refresh

原因：
- 儲存 key 與資料結構目前已經對上
- 問題更像是讀取時機，而不是寫入失敗
- 這一刀修改範圍小，且能直接對應使用者目前感受到的症狀

## 執行時成功條件

### 診斷成功
需明確證明以下兩件事：
- 設定頁新增後，localStorage 內價格項目確實存在
- 錄音頁 / 圖片頁在不整頁重整的情況下，也能重新抓到最新 labels

### 修正成功
需同時成立：
- 在 `settings.html` 新增價格項目後，錄音頁詳細標籤出現新項目
- 在 `settings.html` 新增價格項目後，圖片頁詳細標籤出現新項目
- 不需要靠手動重整才看到新標籤

## 暫不做的事
- 不在這一輪直接搬到 IndexedDB
- 不先改 `checkout.html`
- 不先重構整體資料層
- 不先擴大成全域事件總線

## 開放問題
- [ ] 是否要只在 `renderLabels()` 前同步，還是也要在 `focus` / `visibilitychange` 同步
- [ ] 是否要把同步 helper 同時給 `checkout` 或其他未來會顯示價格標籤的頁面共用
- [ ] 是否要在沒有任何 label 時，補更明確的提示文案

## 下一步
請先 review 這份規劃。

如果確認照這份走，下一輪就直接：
1. 修改 `app.js`
2. 補價格標籤重新同步入口
3. 驗證錄音頁與圖片頁的詳細標籤即時更新
4. 再看要不要補回前景自動 refresh
