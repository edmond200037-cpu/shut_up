import { type CategoryDefinition, type AudioMarker, type AudioWorkflowStage, type EvidenceRecord, type PersonDefinition, type PhotoEvidenceItem } from "../types";

const DB_NAME = "swear-cashier-local";
const DB_VERSION = 2;
const RECORD_STORE = "evidence";
const SETTING_STORE = "settings";
const CATEGORY_KEY = "categories";
const PEOPLE_KEY = "people";

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

type RawMarker = Partial<AudioMarker> & {
  at?: number;
  tag?: string;
  atMs?: number;
  tags?: string[];
};

export function legacyCategoryId(name: string) {
  return `LEGACY-${encodeURIComponent(name.trim()).replace(/%/g, "_")}`;
}

function normalizeCategory(value: unknown): CategoryDefinition | null {
  if (!value || typeof value !== "object") return null;
  const category = value as Partial<CategoryDefinition>;
  if (typeof category.id !== "string" || !category.id || typeof category.name !== "string" || !category.name.trim()) return null;
  return {
    id: category.id,
    name: category.name.trim(),
    unitPrice: Number.isFinite(category.unitPrice) ? Math.max(0, Math.round(Number(category.unitPrice))) : 0,
    billingMode: category.billingMode === "per-occurrence" ? "per-occurrence" : "once-per-evidence",
  };
}

function normalizePerson(value: unknown): PersonDefinition | null {
  if (!value || typeof value !== "object") return null;
  const person = value as Partial<PersonDefinition>;
  if (typeof person.id !== "string" || !person.id || typeof person.name !== "string" || !person.name.trim()) return null;
  return { id: person.id, name: person.name.trim() };
}

export function normalizeMarkers(markers: unknown, recordingId: string): AudioMarker[] {
  if (!Array.isArray(markers)) return [];
  return markers.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const marker = value as RawMarker;
    const timestamp = Number.isFinite(marker.timestamp)
      ? Number(marker.timestamp)
      : Number.isFinite(marker.at)
        ? Number(marker.at)
        : Number.isFinite(marker.atMs)
          ? Number(marker.atMs) / 1_000
          : NaN;
    if (!Number.isFinite(timestamp)) return [];
    const safeTimestamp = Math.max(0, timestamp);
    const legacyNames = [marker.category, marker.tag, ...(marker.tags || [])]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    const categoryIds = Array.isArray(marker.categoryIds)
      ? marker.categoryIds.filter((id): id is string => typeof id === "string" && Boolean(id))
      : legacyNames.map(legacyCategoryId);
    return [{
      id: typeof marker.id === "string" && marker.id ? marker.id : `${recordingId}-MARK-${index + 1}`,
      timestamp: safeTimestamp,
      previewStart: Math.max(0, safeTimestamp - 10),
      personId: typeof marker.personId === "string" && marker.personId ? marker.personId : null,
      categoryIds: [...new Set(categoryIds)],
      category: legacyNames[0],
    }];
  });
}

function normalizePhotoItems(value: unknown, recordId: string, categoryIds: string[]): PhotoEvidenceItem[] {
  if (Array.isArray(value)) {
    const normalized = value.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const raw = item as Partial<PhotoEvidenceItem>;
      return [{
        id: typeof raw.id === "string" && raw.id ? raw.id : `${recordId}-EVIDENCE-${index + 1}`,
        personId: typeof raw.personId === "string" && raw.personId ? raw.personId : null,
        categoryIds: Array.isArray(raw.categoryIds) ? [...new Set(raw.categoryIds.filter((id): id is string => typeof id === "string" && Boolean(id)))] : [],
      }];
    });
    if (normalized.length) return normalized;
  }
  return [{ id: `${recordId}-EVIDENCE-1`, personId: null, categoryIds: [...new Set(categoryIds)] }];
}

function normalizeAudioStage(value: unknown, hasMarkers: boolean): AudioWorkflowStage {
  return value === "classifying" || value === "marking" ? value : hasMarkers ? "classifying" : "marking";
}

function normalizeRecord(record: Partial<EvidenceRecord> & Pick<EvidenceRecord, "id" | "blob">): EvidenceRecord {
  const createdAt = record.createdAt || new Date().toISOString();
  const kind = record.kind === "photo" ? "photo" : "audio";
  const categoryIds = Array.isArray(record.categoryIds)
    ? record.categoryIds.filter((id): id is string => typeof id === "string" && Boolean(id))
    : (Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map(legacyCategoryId) : []);
  const markers = normalizeMarkers(record.markers, record.id);
  const hasLegacyWholeAssignment = kind === "audio" && (categoryIds.length > 0 || (typeof record.personId === "string" && Boolean(record.personId))) && record.legacyWholeAssignmentPending !== false;
  return {
    id: record.id,
    kind,
    title: record.title || "未命名紀錄",
    occurredAt: record.occurredAt || createdAt,
    createdAt,
    duration: record.duration,
    tags: Array.isArray(record.tags) ? record.tags : [],
    categoryIds,
    markers,
    audioWorkflowStage: kind === "audio" ? normalizeAudioStage(record.audioWorkflowStage, markers.length > 0) : "classifying",
    legacyWholeAssignmentPending: hasLegacyWholeAssignment,
    notes: record.notes || "",
    amount: Number(record.amount) || 0,
    mime: record.mime || record.blob.type || "application/octet-stream",
    fileName: record.fileName || `${record.id}.bin`,
    fileSize: Number(record.fileSize) || record.blob.size,
    personId: typeof record.personId === "string" && record.personId ? record.personId : null,
    photoItems: kind === "photo" ? normalizePhotoItems(record.photoItems, record.id, categoryIds) : [],
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

export async function getCategories() {
  const database = await openDatabase();
  const [storedCategories, storedRecords] = await Promise.all([
    requestValue(database.transaction(SETTING_STORE, "readonly").objectStore(SETTING_STORE).get(CATEGORY_KEY)),
    requestValue(database.transaction(RECORD_STORE, "readonly").objectStore(RECORD_STORE).getAll()),
  ]);
  const setting = storedCategories as StoredSetting<CategoryDefinition[]> | undefined;
  const categories = Array.isArray(setting?.value) ? setting.value.map(normalizeCategory).filter((value): value is CategoryDefinition => Boolean(value)) : [];
  const names = new Set<string>();
  for (const raw of (storedRecords as Array<Partial<EvidenceRecord> & { blob: Blob }>)) {
    for (const tag of Array.isArray(raw.tags) ? raw.tags : []) if (typeof tag === "string" && tag.trim()) names.add(tag.trim());
    for (const marker of Array.isArray(raw.markers) ? raw.markers : []) {
      if (marker && typeof marker === "object" && typeof (marker as RawMarker).category === "string" && (marker as RawMarker).category!.trim()) names.add((marker as RawMarker).category!.trim());
      if (marker && typeof marker === "object" && typeof (marker as RawMarker).tag === "string" && (marker as RawMarker).tag!.trim()) names.add((marker as RawMarker).tag!.trim());
    }
  }
  const existingIds = new Set(categories.map((category) => category.id));
  const migrated = [...categories];
  for (const name of names) {
    const id = legacyCategoryId(name);
    if (!existingIds.has(id)) {
      migrated.push({ id, name, unitPrice: 0, billingMode: "once-per-evidence" });
      existingIds.add(id);
    }
  }
  if (migrated.length !== categories.length) await putCategories(migrated);
  return migrated;
}

export async function getPeople() {
  const database = await openDatabase();
  const stored = await requestValue(database.transaction(SETTING_STORE, "readonly").objectStore(SETTING_STORE).get(PEOPLE_KEY));
  const setting = stored as StoredSetting<PersonDefinition[]> | undefined;
  return Array.isArray(setting?.value)
    ? setting.value.map(normalizePerson).filter((value): value is PersonDefinition => Boolean(value))
    : [];
}

export async function putPeople(people: PersonDefinition[]) {
  const database = await openDatabase();
  const seen = new Set<string>();
  const normalized = people.map(normalizePerson).filter((value): value is PersonDefinition => {
    if (!value || seen.has(value.name)) return false;
    seen.add(value.name);
    return true;
  });
  await requestValue(
    database.transaction(SETTING_STORE, "readwrite").objectStore(SETTING_STORE).put({ key: PEOPLE_KEY, value: normalized } satisfies StoredSetting<PersonDefinition[]>),
  );
}

export async function putCategories(categories: CategoryDefinition[]) {
  const database = await openDatabase();
  const normalized = categories.map(normalizeCategory).filter((value): value is CategoryDefinition => Boolean(value));
  await requestValue(
    database.transaction(SETTING_STORE, "readwrite").objectStore(SETTING_STORE).put({ key: CATEGORY_KEY, value: normalized } satisfies StoredSetting<CategoryDefinition[]>),
  );
}

export async function deleteCategory(category: CategoryDefinition) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([RECORD_STORE, SETTING_STORE], "readwrite");
    const records = transaction.objectStore(RECORD_STORE);
    const settings = transaction.objectStore(SETTING_STORE);
    const categoryRequest = settings.get(CATEGORY_KEY);
    categoryRequest.onsuccess = () => {
      const stored = categoryRequest.result as StoredSetting<CategoryDefinition[]> | undefined;
      const categories = (stored?.value || []).filter((item) => item.id !== category.id);
      settings.put({ key: CATEGORY_KEY, value: categories });
      const cursorRequest = records.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const record = normalizeRecord(cursor.value);
        record.categoryIds = record.categoryIds.filter((id) => id !== category.id);
        record.tags = record.tags.filter((tag) => tag !== category.name);
        record.markers = (record.markers || []).map((marker) => ({
          ...marker,
          categoryIds: marker.categoryIds.filter((id) => id !== category.id),
          category: marker.category === category.name ? "" : marker.category,
        }));
        record.photoItems = (record.photoItems || []).map((item) => ({
          ...item,
          categoryIds: item.categoryIds.filter((id) => id !== category.id),
        }));
        cursor.update(record);
        cursor.continue();
      };
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("刪除分類失敗"));
  });
}

export async function deletePerson(person: PersonDefinition) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([RECORD_STORE, SETTING_STORE], "readwrite");
    const records = transaction.objectStore(RECORD_STORE);
    const settings = transaction.objectStore(SETTING_STORE);
    const peopleRequest = settings.get(PEOPLE_KEY);
    peopleRequest.onsuccess = () => {
      const stored = peopleRequest.result as StoredSetting<PersonDefinition[]> | undefined;
      settings.put({ key: PEOPLE_KEY, value: (stored?.value || []).filter((item) => item.id !== person.id) });
      const cursorRequest = records.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const record = normalizeRecord(cursor.value);
        record.personId = record.personId === person.id ? null : record.personId;
        record.markers = (record.markers || []).map((marker) => ({ ...marker, personId: marker.personId === person.id ? null : marker.personId }));
        record.photoItems = (record.photoItems || []).map((item) => ({ ...item, personId: item.personId === person.id ? null : item.personId }));
        cursor.update(record);
        cursor.continue();
      };
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("刪除人物失敗"));
  });
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
