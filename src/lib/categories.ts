import type { AudioMarker, CategoryDefinition, EvidenceRecord, PersonDefinition } from "../types";

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

export function categoryIdsForRecord(record: EvidenceRecord) {
  const ids = new Set(record.categoryIds);
  for (const marker of record.markers || []) marker.categoryIds.forEach((id) => ids.add(id));
  for (const item of record.photoItems || []) item.categoryIds.forEach((id) => ids.add(id));
  return [...ids];
}

export function personIdsForRecord(record: EvidenceRecord) {
  const ids = new Set<string>();
  if (record.personId) ids.add(record.personId);
  for (const marker of record.markers || []) if (marker.personId) ids.add(marker.personId);
  for (const item of record.photoItems || []) if (item.personId) ids.add(item.personId);
  return [...ids];
}

export function personName(personId: string | null | undefined, people: PersonDefinition[]) {
  if (!personId) return "未指定";
  return people.find((person) => person.id === personId)?.name || "未指定";
}

export type CategoryTotal = CategoryDefinition & {
  count: number;
  subtotal: number;
};

export type BillingAssignment = {
  recordId: string;
  personId: string | null;
  categoryIds: string[];
};

export type PersonCategoryTotal = CategoryTotal;

export type PersonBillingTotal = {
  personId: string | null;
  name: string;
  categories: PersonCategoryTotal[];
  legacyTotal: number;
  subtotal: number;
};

export function getBillingAssignments(record: EvidenceRecord): BillingAssignment[] {
  if (record.kind === "photo") {
    const items = record.photoItems || [];
    if (items.length) return items.map((item) => ({ recordId: record.id, personId: item.personId, categoryIds: item.categoryIds }));
  }
  if (record.kind === "audio") {
    return (record.markers || []).map((marker) => ({ recordId: record.id, personId: marker.personId, categoryIds: marker.categoryIds }));
  }
  return [{ recordId: record.id, personId: record.personId, categoryIds: record.categoryIds }];
}

export function countCategoryOccurrences(record: EvidenceRecord, category: CategoryDefinition) {
  const assignments = getBillingAssignments(record).filter((assignment) => assignment.categoryIds.includes(category.id));
  if (category.billingMode === "once-per-evidence") {
    return new Set(assignments.map((assignment) => assignment.personId || null)).size;
  }
  return assignments.length;
}

export function calculateCategoryTotals(records: EvidenceRecord[], categories: CategoryDefinition[]): CategoryTotal[] {
  return categories
    .map((category) => {
      const count = records.reduce((total, record) => total + countCategoryOccurrences(record, category), 0);
      return { ...category, count, subtotal: count * category.unitPrice };
    })
    .filter((category) => category.count > 0);
}

export function calculatePersonTotals(records: EvidenceRecord[], categories: CategoryDefinition[], people: PersonDefinition[]): PersonBillingTotal[] {
  const validPeople = new Set(people.map((person) => person.id));
  const groups = new Map<string, { counts: Map<string, number>; legacyTotal: number }>();
  const keyFor = (personId: string | null) => personId && validPeople.has(personId) ? personId : "__UNASSIGNED__";
  const ensure = (key: string) => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created = { counts: new Map<string, number>(), legacyTotal: 0 };
    groups.set(key, created);
    return created;
  };
  const onceSeen = new Set<string>();

  for (const record of records) {
    for (const assignment of getBillingAssignments(record)) {
      const key = keyFor(assignment.personId);
      const group = ensure(key);
      for (const categoryId of new Set(assignment.categoryIds)) {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) continue;
        const onceKey = `${record.id}:${key}:${category.id}`;
        if (category.billingMode === "once-per-evidence") {
          if (onceSeen.has(onceKey)) continue;
          onceSeen.add(onceKey);
        }
        group.counts.set(category.id, (group.counts.get(category.id) || 0) + 1);
      }
    }
    if (Number(record.amount) > 0) ensure("__UNASSIGNED__").legacyTotal += Number(record.amount);
  }

  const orderedKeys = [
    ...people.map((person) => person.id).filter((id) => groups.has(id)),
    ...(groups.has("__UNASSIGNED__") ? ["__UNASSIGNED__"] : []),
  ];
  return orderedKeys.map((key) => {
    const group = groups.get(key)!;
    const categoryTotals = categories
      .map((category) => {
        const count = group.counts.get(category.id) || 0;
        return { ...category, count, subtotal: count * category.unitPrice };
      })
      .filter((category) => category.count > 0);
    const categorySubtotal = categoryTotals.reduce((total, category) => total + category.subtotal, 0);
    return {
      personId: key === "__UNASSIGNED__" ? null : key,
      name: key === "__UNASSIGNED__" ? "未指定" : personName(key, people),
      categories: categoryTotals,
      legacyTotal: group.legacyTotal,
      subtotal: categorySubtotal + group.legacyTotal,
    };
  });
}

export function calculateLegacyAdjustments(records: EvidenceRecord[]) {
  return records
    .filter((record) => Number(record.amount) > 0)
    .map((record) => ({ id: record.id, title: record.title, amount: Number(record.amount) }));
}

export function categoryIdsFromMarker(marker: AudioMarker) {
  return Array.isArray(marker.categoryIds) ? marker.categoryIds : [];
}
