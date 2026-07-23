import type { AudioMarker, CategoryDefinition, EvidenceRecord } from "../types";

export const CATEGORY_COLORS = ["red", "orange", "violet", "lime", "cyan", "gold"] as const;

export function categoryColor(categoryId: string, categories: CategoryDefinition[]) {
  const index = Math.max(0, categories.findIndex((category) => category.id === categoryId));
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export function categoryName(categoryId: string, categories: CategoryDefinition[]) {
  return categories.find((category) => category.id === categoryId)?.name || "未命名分類";
}

export function categoryLabels(categoryIds: string[], categories: CategoryDefinition[]) {
  return categoryIds
    .map((id) => categories.find((category) => category.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

export type CategoryTotal = CategoryDefinition & {
  count: number;
  subtotal: number;
};

function assignmentsForRecord(record: EvidenceRecord, categoryId: string) {
  const recordCount = record.categoryIds.includes(categoryId) ? 1 : 0;
  const markerCount = record.kind === "audio"
    ? (record.markers || []).filter((marker) => marker.categoryIds.includes(categoryId)).length
    : 0;
  return recordCount + markerCount;
}

export function countCategoryOccurrences(record: EvidenceRecord, category: CategoryDefinition) {
  const count = assignmentsForRecord(record, category.id);
  return category.billingMode === "once-per-evidence" ? (count > 0 ? 1 : 0) : count;
}

export function calculateCategoryTotals(records: EvidenceRecord[], categories: CategoryDefinition[]): CategoryTotal[] {
  return categories
    .map((category) => {
      const count = records.reduce((total, record) => total + countCategoryOccurrences(record, category), 0);
      return { ...category, count, subtotal: count * category.unitPrice };
    })
    .filter((category) => category.count > 0);
}

export function calculateLegacyAdjustments(records: EvidenceRecord[]) {
  return records
    .filter((record) => Number(record.amount) > 0)
    .map((record) => ({ id: record.id, title: record.title, amount: Number(record.amount) }));
}

export function categoryIdsFromMarker(marker: AudioMarker) {
  return Array.isArray(marker.categoryIds) ? marker.categoryIds : [];
}
