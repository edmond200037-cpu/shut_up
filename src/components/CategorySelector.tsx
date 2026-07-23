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
    <section className="category-selector" aria-label={label}>
      <div className="section-inline-title"><h3>{label}</h3><span>可複選</span></div>
      <div className="category-selector-grid">
        {categories.map((category) => {
          const selected = selectedIds.includes(category.id);
          return (
            <button
              type="button"
              className={`category-pill category-${categoryColor(category.id, categories)} ${selected ? "active" : ""}`}
              key={category.id}
              aria-pressed={selected}
              onClick={() => toggle(category.id)}
            >
              {category.name}
            </button>
          );
        })}
      </div>
      {!categories.length && <p className="muted">請先到設定建立分類標籤。</p>}
    </section>
  );
}
