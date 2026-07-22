export type View =
  | "dashboard"
  | "record"
  | "photos"
  | "ledger"
  | "checkout"
  | "settings";

export type EvidenceKind = "audio" | "photo";

export type Marker = {
  at: number;
  tag: string;
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
  markers?: Marker[];
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
  version: 2;
  exportedAt: string;
  quickTags: string[];
  records: BackupRecord[];
};
