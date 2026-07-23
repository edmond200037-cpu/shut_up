export type View =
  | "dashboard"
  | "record"
  | "photos"
  | "ledger"
  | "checkout"
  | "settings";

export type EvidenceKind = "audio" | "photo";

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
  category: EvidenceCategory | "";
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
  tags: string[];
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
  version: 3;
  exportedAt: string;
  quickTags: string[];
  records: BackupRecord[];
};
