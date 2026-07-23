import { EVIDENCE_CATEGORIES, type View } from "./types";

export const DEFAULT_QUICK_TAGS: string[] = [...EVIDENCE_CATEGORIES];

export const MAX_QUICK_TAGS = 8;

export const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "總覽", icon: "▦" },
  { id: "record", label: "對話錄音", icon: "●" },
  { id: "photos", label: "照片紀錄", icon: "▣" },
  { id: "ledger", label: "對話對帳單", icon: "▤" },
  { id: "checkout", label: "結帳", icon: "▥" },
  { id: "settings", label: "設定", icon: "⚙" },
];
