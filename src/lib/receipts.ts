import type { CategoryDefinition, EvidenceRecord, PersonDefinition } from "../types";
import { formatDuration } from "./format";

export type ReceiptLine = {
  id: string;
  recordId: string;
  personId: string | null;
  personName: string;
  sourceFile: string;
  categoryId: string;
  categoryName: string;
  position: string;
  timestamp: number | null;
  unitPrice: number;
  amount: number;
  billingMode: CategoryDefinition["billingMode"] | "legacy";
};

type ReceiptAssignment = {
  id: string;
  recordId: string;
  personId: string | null;
  categoryIds: string[];
  position: string;
  timestamp: number | null;
};

function normalizedPersonId(personId: string | null, people: PersonDefinition[]) {
  return personId && people.some((person) => person.id === personId) ? personId : null;
}

function assignmentsForRecord(record: EvidenceRecord): ReceiptAssignment[] {
  if (record.kind === "photo") {
    return (record.photoItems || []).map((item) => ({
      id: item.id,
      recordId: record.id,
      personId: item.personId,
      categoryIds: item.categoryIds,
      position: "圖片證據",
      timestamp: null,
    }));
  }
  return (record.markers || []).map((marker) => ({
    id: marker.id,
    recordId: record.id,
    personId: marker.personId,
    categoryIds: marker.categoryIds,
    position: formatDuration(marker.timestamp),
    timestamp: marker.timestamp,
  }));
}

export function buildReceiptLines(
  records: EvidenceRecord[],
  categories: CategoryDefinition[],
  people: PersonDefinition[],
  selectedPersonId: string | null,
) {
  const lines: ReceiptLine[] = [];
  const onceSeen = new Set<string>();
  const personLabel = people.find((person) => person.id === selectedPersonId)?.name || "未指定";

  for (const record of records) {
    for (const assignment of assignmentsForRecord(record)) {
      const personId = normalizedPersonId(assignment.personId, people);
      if (personId !== selectedPersonId) continue;
      for (const categoryId of new Set(assignment.categoryIds)) {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) continue;
        const onceKey = `${record.id}:${personId || "unassigned"}:${category.id}`;
        if (category.billingMode === "once-per-evidence" && onceSeen.has(onceKey)) continue;
        if (category.billingMode === "once-per-evidence") onceSeen.add(onceKey);
        lines.push({
          id: `${record.id}:${assignment.id}:${category.id}`,
          recordId: record.id,
          personId,
          personName: personLabel,
          sourceFile: record.fileName,
          categoryId: category.id,
          categoryName: category.name,
          position: assignment.position,
          timestamp: assignment.timestamp,
          unitPrice: category.unitPrice,
          amount: category.unitPrice,
          billingMode: category.billingMode,
        });
      }
    }
    if (selectedPersonId === null && Number(record.amount) > 0) {
      lines.push({
        id: `${record.id}:legacy-amount`,
        recordId: record.id,
        personId: null,
        personName: "未指定",
        sourceFile: record.fileName,
        categoryId: "__legacy__",
        categoryName: "舊版調整項",
        position: "舊版資料",
        timestamp: null,
        unitPrice: Number(record.amount),
        amount: Number(record.amount),
        billingMode: "legacy",
      });
    }
  }

  return lines.sort((a, b) => {
    if (a.recordId !== b.recordId) return a.recordId.localeCompare(b.recordId);
    if (a.timestamp === null) return 1;
    if (b.timestamp === null) return -1;
    return a.timestamp - b.timestamp;
  });
}

export function summarizeReceiptLines(lines: ReceiptLine[]) {
  const groups = new Map<string, { categoryName: string; count: number; unitPrice: number; subtotal: number }>();
  for (const line of lines) {
    const existing = groups.get(line.categoryId);
    if (existing) {
      existing.count += 1;
      existing.subtotal += line.amount;
    } else {
      groups.set(line.categoryId, { categoryName: line.categoryName, count: 1, unitPrice: line.unitPrice, subtotal: line.amount });
    }
  }
  return [...groups.values()];
}
