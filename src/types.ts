export type View =
  | "dashboard"
  | "record"
  | "photos"
  | "ledger"
  | "checkout"
  | "settings";

export type EvidenceKind = "audio" | "photo";

export type CategoryBillingMode = "per-occurrence" | "once-per-evidence";

export type CategoryDefinition = {
  id: string;
  name: string;
  unitPrice: number;
  billingMode: CategoryBillingMode;
};

export type LegacyMarker = {
  at: number;
  tag?: string;
};

export const EVIDENCE_CATEGORIES = ["辱罵", "恐嚇", "霸凌", "歧視", "性騷擾", "其他"] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export type AudioMarker = {
  id: string;
  /** 錄音開始後的秒數。 */
  timestamp: number;
  /** 點擊標籤時播放器開始預覽的秒數。 */
  previewStart: number;
  categoryIds: string[];
  /** 舊版單一分類名稱，僅供資料遷移。 */
  category?: string;
};

export type EvidenceRecord = {
  id: string;
  kind: EvidenceKind;
  title: string;
  /** 使用者認定的事件發生時間。 */
  occurredAt: string;
  /** 紀錄加入資料庫的時間。 */
  createdAt: string;
  duration?: number;
  /** 舊版自由文字標籤，僅供資料遷移與備份相容。 */
  tags: string[];
  categoryIds: string[];
  markers?: AudioMarker[];
  notes: string;
  amount?: number;
  mime: string;
  fileName: string;
  fileSize: number;
  sha256?: string;
  blob: Blob;
};

export type BackupRecord = Omit<EvidenceRecord, "blob"> & {
  mediaPath: string;
};

export type BackupManifest = {
  format: "shut-up-evidence-backup";
  version: 4;
  exportedAt: string;
  categories: CategoryDefinition[];
  /** 舊版備份欄位，讀取後會轉成 categories。 */
  quickTags?: string[];
  records: BackupRecord[];
};
