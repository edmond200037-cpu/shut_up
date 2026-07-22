import { DEFAULT_QUICK_TAGS } from "../constants";
import type { EvidenceRecord } from "../types";

const DB_NAME = "swear-cashier-local";
const DB_VERSION = 2;
const RECORD_STORE = "evidence";
const SETTING_STORE = "settings";
const QUICK_TAG_KEY = "quick-tags";

type StoredSetting<T> = { key: string; value: T };

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        database.createObjectStore(RECORD_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTING_STORE)) {
        database.createObjectStore(SETTING_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeRecord(record: Partial<EvidenceRecord> & Pick<EvidenceRecord, "id" | "blob">): EvidenceRecord {
  const createdAt = record.createdAt || new Date().toISOString();
  return {
    id: record.id,
    kind: record.kind === "photo" ? "photo" : "audio",
    title: record.title || "未命名紀錄",
    occurredAt: record.occurredAt || createdAt,
    createdAt,
    duration: record.duration,
    tags: Array.isArray(record.tags) ? record.tags : [],
    markers: Array.isArray(record.markers) ? record.markers : [],
    notes: record.notes || "",
    amount: Number(record.amount) || 0,
    mime: record.mime || record.blob.type || "application/octet-stream",
    fileName: record.fileName || `${record.id}.bin`,
    fileSize: Number(record.fileSize) || record.blob.size,
    sha256: record.sha256,
    blob: record.blob,
  };
}

export async function getAllRecords() {
  const database = await openDatabase();
  const result = await requestValue(
    database.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll(),
  );
  return (result as EvidenceRecord[])
    .map((record) => normalizeRecord(record))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function putRecord(record: EvidenceRecord) {
  const database = await openDatabase();
  await requestValue(
    database.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).put(normalizeRecord(record)),
  );
}

export async function deleteRecord(id: string) {
  const database = await openDatabase();
  await requestValue(
    database.transaction(RECORD_STORE, "readwrite").objectStore(RECORD_STORE).delete(id),
  );
}

export async function getQuickTags() {
  const database = await openDatabase();
  const setting = (await requestValue(
    database.transaction(SETTING_STORE, "readonly").objectStore(SETTING_STORE).get(QUICK_TAG_KEY),
  )) as StoredSetting<string[]> | undefined;
  return Array.isArray(setting?.value) && setting.value.length ? setting.value : DEFAULT_QUICK_TAGS;
}

export async function putQuickTags(tags: string[]) {
  const database = await openDatabase();
  await requestValue(
    database
      .transaction(SETTING_STORE, "readwrite")
      .objectStore(SETTING_STORE)
      .put({ key: QUICK_TAG_KEY, value: tags } satisfies StoredSetting<string[]>),
  );
}

export async function clearAllData() {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([RECORD_STORE, SETTING_STORE], "readwrite");
    transaction.objectStore(RECORD_STORE).clear();
    transaction.objectStore(SETTING_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
