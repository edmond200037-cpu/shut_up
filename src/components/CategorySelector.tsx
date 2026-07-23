import type { CategoryDefinition } from "../types";
import { categoryColor } from "../lib/categories";

export function CategorySelector({
  categories,
  selectedIds,
  onChange,
  label,
}: {
  categories: CategoryDefinition[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <fieldset className="category-selector">
      <legend>{label}</legend>
      <div className="category-selector-grid">
        {categories.map((category) => (
          <label className={`category-check category-${categoryColor(category.id, categories)} ${selectedIds.includes(category.id) ? "active" : ""}`} key={category.id}>
            <input type="checkbox" checked={selectedIds.includes(category.id)} onChange={() => toggle(category.id)} />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
      {!categories.length && <p className="muted">請先到設定建立分類標籤。</p>}
    </fieldset>
  );
}
