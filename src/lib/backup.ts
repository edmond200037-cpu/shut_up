import type { BackupManifest, BackupRecord, EvidenceRecord, CategoryDefinition, PersonDefinition } from "../types";
import { safeFileName } from "./format";
import { legacyCategoryId } from "./db";

type ZipEntry = { name: string; data: Uint8Array };

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[n] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 255;
  target[offset + 1] = (value >>> 8) & 255;
}

function write32(target: Uint8Array, offset: number, value: number) {
  write16(target, offset, value & 65535);
  write16(target, offset + 2, value >>> 16);
}

function toBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function createStoredZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length + entry.data.length);
    write32(local, 0, 0x04034b50);
    write16(local, 4, 20);
    write16(local, 6, 0x0800);
    write16(local, 8, 0);
    write32(local, 14, crc);
    write32(local, 18, entry.data.length);
    write32(local, 22, entry.data.length);
    write16(local, 26, name.length);
    local.set(name, 30);
    local.set(entry.data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    write32(central, 0, 0x02014b50);
    write16(central, 4, 20);
    write16(central, 6, 20);
    write16(central, 8, 0x0800);
    write32(central, 16, crc);
    write32(central, 20, entry.data.length);
    write32(central, 24, entry.data.length);
    write16(central, 28, name.length);
    write32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50);
  write16(end, 8, entries.length);
  write16(end, 10, entries.length);
  write32(end, 12, centralSize);
  write32(end, 16, offset);
  return new Blob([...localParts, ...centralParts, end].map(toBuffer), { type: "application/zip" });
}

export function readStoredZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const files = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 30 <= buffer.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0) throw new Error("此 ZIP 使用不支援的壓縮格式");
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.byteLength) throw new Error("備份檔案內容不完整");
    const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength));
    files.set(name, new Uint8Array(buffer.slice(dataStart, dataEnd)));
    offset = dataEnd;
  }
  return files;
}

export async function buildBackup(records: EvidenceRecord[], categories: CategoryDefinition[], people: PersonDefinition[]) {
  const entries: ZipEntry[] = [];
  const manifestRecords = [];
  for (const record of records) {
    const mediaPath = `media/${record.id}-${safeFileName(record.fileName)}`;
    entries.push({ name: mediaPath, data: new Uint8Array(await record.blob.arrayBuffer()) });
    const { blob: _blob, ...metadata } = record;
    void _blob;
    manifestRecords.push({ ...metadata, mediaPath });
  }
  const manifest: BackupManifest = {
    format: "shut-up-evidence-backup",
    version: 6,
    exportedAt: new Date().toISOString(),
    categories,
    people,
    records: manifestRecords,
  };
  entries.unshift({
    name: "backup.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });
  return createStoredZip(entries);
}

export function parseBackup(buffer: ArrayBuffer) {
  const files = readStoredZip(buffer);
  const manifestBytes = files.get("backup.json");
  if (!manifestBytes) throw new Error("找不到 backup.json");
  type RawRecord = Partial<BackupRecord> & Pick<
    BackupRecord,
    "id" | "kind" | "title" | "createdAt" | "tags" | "notes" | "mime" | "fileName" | "mediaPath"
  >;
  const raw = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    format?: string;
    version?: number;
    exportedAt?: string;
    categories?: CategoryDefinition[];
    people?: PersonDefinition[];
    quickTags?: string[];
    records?: RawRecord[];
  };
  if (!Array.isArray(raw.records)) {
    throw new Error("備份索引格式錯誤");
  }
  if (raw.format === "swear-cashier-backup" && raw.version === 1) {
    const manifest: BackupManifest = {
      format: "shut-up-evidence-backup",
      version: 6,
      exportedAt: raw.exportedAt || new Date().toISOString(),
      categories: [],
      people: [],
      records: raw.records.map((record): BackupRecord => ({
        ...record,
        occurredAt: record.occurredAt || record.createdAt,
        fileSize: record.fileSize || 0,
        categoryIds: [],
        personId: null,
        photoItems: [],
        audioWorkflowStage: "marking",
        legacyWholeAssignmentPending: false,
      })),
    };
    return { files, manifest };
  }
  if (
    raw.format !== "shut-up-evidence-backup"
    || ![2, 3, 4, 5, 6].includes(raw.version || 0)
  ) {
    throw new Error("不是相容的髒話收銀機備份");
  }
  const categories = Array.isArray(raw.categories)
    ? raw.categories
    : (Array.isArray(raw.quickTags) ? raw.quickTags.map((name) => ({ id: legacyCategoryId(name), name, unitPrice: 0, billingMode: "once-per-evidence" as const })) : []);
  const people = Array.isArray(raw.people) ? raw.people : [];
  const manifest = {
    ...raw,
    version: 6,
    categories,
    people,
    records: raw.records.map((record) => ({
      ...record,
      categoryIds: record.categoryIds || [],
      personId: record.personId || null,
      photoItems: record.photoItems || [],
      audioWorkflowStage: record.audioWorkflowStage || "marking",
      legacyWholeAssignmentPending: Boolean(record.legacyWholeAssignmentPending),
    })),
  } as BackupManifest;
  return { files, manifest };
}
