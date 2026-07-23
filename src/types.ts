export type View =
  | "dashboard"
  | "record"
  | "photos"
  | "ledger"
  | "checkout"
  | "settings";

export type EvidenceKind = "audio" | "photo";

export type AudioWorkflowStage = "marking" | "classifying";

export type CategoryBillingMode = "per-occurrence" | "once-per-evidence";

export type CategoryDefinition = {
  id: string;
  name: string;
  unitPrice: number;
  billingMode: CategoryBillingMode;
};

export type PersonDefinition = {
  id: string;
  name: string;
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
  personId: string | null;
  categoryIds: string[];
  /** 舊版單一分類名稱，僅供資料遷移。 */
  category?: string;
};

export type PhotoEvidenceItem = {
  id: string;
  personId: string | null;
  categoryIds: string[];
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
  /** 上傳音檔先標記、再分類的流程狀態。 */
  audioWorkflowStage: AudioWorkflowStage;
  /** 舊版整筆錄音分類，等待使用者移轉到快速標籤。 */
  legacyWholeAssignmentPending: boolean;
  notes: string;
  amount?: number;
  mime: string;
  fileName: string;
  fileSize: number;
  /** 整筆錄音或未拆分證據的歸戶人物。 */
  personId: string | null;
  /** 照片拆分後的證據項目；每張照片至少保留一項。 */
  photoItems: PhotoEvidenceItem[];
  sha256?: string;
  blob: Blob;
};

export type BackupRecord = Omit<EvidenceRecord, "blob"> & {
  mediaPath: string;
};

export type BackupManifest = {
  format: "shut-up-evidence-backup";
  version: 6;
  exportedAt: string;
  categories: CategoryDefinition[];
  people: PersonDefinition[];
  /** 舊版備份欄位，讀取後會轉成 categories。 */
  quickTags?: string[];
  records: BackupRecord[];
};
