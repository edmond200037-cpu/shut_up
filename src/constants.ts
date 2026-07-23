import type { View } from "./types";

export const DEFAULT_CATEGORIES = [];

/** 舊版清除資料與備份讀取的相容值；快速標籤本身已改為系統自動編號。 */
export const DEFAULT_QUICK_TAGS: string[] = [];

/** 舊版元件的編譯相容常數；新分類編輯器不使用數量上限。 */
export const MAX_QUICK_TAGS = 8;

export const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "總覽", icon: "▦" },
  { id: "record", label: "對話錄音", icon: "●" },
  { id: "photos", label: "照片紀錄", icon: "▣" },
  { id: "ledger", label: "對話對帳單", icon: "▤" },
  { id: "checkout", label: "結帳", icon: "▥" },
  { id: "settings", label: "設定", icon: "⚙" },
];
