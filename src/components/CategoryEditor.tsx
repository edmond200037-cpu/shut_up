import { useState } from "react";
import type { CategoryBillingMode, CategoryDefinition } from "../types";
import { makeId } from "../lib/format";

export function CategoryEditor({
  categories,
  onChange,
  onDelete,
  flash,
}: {
  categories: CategoryDefinition[];
  onChange: (categories: CategoryDefinition[]) => Promise<void>;
  onDelete: (category: CategoryDefinition) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [newMode, setNewMode] = useState<CategoryBillingMode>("once-per-evidence");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});

  async function addCategory() {
    const name = newName.trim();
    if (!name) return flash("請輸入分類名稱。");
    if (categories.some((category) => category.name === name)) return flash("這個分類名稱已存在。");
    const category: CategoryDefinition = {
      id: makeId("CAT"),
      name,
      unitPrice: Math.max(0, Math.round(Number(newPrice) || 0)),
      billingMode: newMode,
    };
    await onChange([...categories, category]);
    setNewName("");
    setNewPrice("0");
    flash(`已新增分類「${name}」。`);
  }

  async function updateCategory(category: CategoryDefinition, patch: Partial<CategoryDefinition>) {
    const next = categories.map((item) => item.id === category.id ? { ...item, ...patch } : item);
    if (patch.name && next.some((item) => item.id !== category.id && item.name === patch.name)) return flash("這個分類名稱已存在。");
    await onChange(next);
  }

  async function removeCategory(category: CategoryDefinition) {
    await onDelete(category);
  }

  return (
    <div className="category-editor">
      <div className="category-editor-head" aria-hidden="true">
        <span>分類名稱</span><span>單價</span><span>計價方式</span><span>操作</span>
      </div>
      <div className="category-editor-list">
        {categories.map((category) => (
          <div className="category-editor-row" key={category.id}>
            <input
              aria-label={`${category.name} 分類名稱`}
              value={draftNames[category.id] ?? category.name}
              disabled={editingId !== category.id}
              onChange={(event) => setDraftNames((current) => ({ ...current, [category.id]: event.target.value }))}
              onBlur={() => {
                const name = (draftNames[category.id] ?? category.name).trim();
                setDraftNames((current) => { const next = { ...current }; delete next[category.id]; return next; });
                if (name && name !== category.name) void updateCategory(category, { name });
              }}
            />
            <label className="price-input"><span>NT$</span><input disabled={editingId !== category.id} aria-label={`${category.name} 單價`} type="number" min="0" step="1" value={draftPrices[category.id] ?? category.unitPrice} onChange={(event) => setDraftPrices((current) => ({ ...current, [category.id]: event.target.value }))} onBlur={() => { const value = Math.max(0, Math.round(Number(draftPrices[category.id] ?? category.unitPrice) || 0)); setDraftPrices((current) => { const next = { ...current }; delete next[category.id]; return next; }); if (value !== category.unitPrice) void updateCategory(category, { unitPrice: value }); }} /></label>
            <select disabled={editingId !== category.id} aria-label={`${category.name} 計價方式`} value={category.billingMode} onChange={(event) => void updateCategory(category, { billingMode: event.target.value as CategoryBillingMode })}>
              <option value="once-per-evidence">每筆證據一次</option>
              <option value="per-occurrence">每次出現</option>
            </select>
            <div className="category-actions"><button type="button" className="secondary-button" onClick={() => setEditingId(editingId === category.id ? null : category.id)}>{editingId === category.id ? "完成" : "編輯"}</button><button type="button" className="danger-link" onClick={() => void removeCategory(category)}>刪除</button></div>
          </div>
        ))}
      </div>
      <div className="category-editor-add">
        <input value={newName} placeholder="新增分類名稱" aria-label="新增分類名稱" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addCategory()} />
        <label className="price-input"><span>NT$</span><input type="number" min="0" step="1" value={newPrice} aria-label="新增分類單價" onChange={(event) => setNewPrice(event.target.value)} /></label>
        <select value={newMode} aria-label="新增分類計價方式" onChange={(event) => setNewMode(event.target.value as CategoryBillingMode)}>
          <option value="once-per-evidence">每筆證據一次</option>
          <option value="per-occurrence">每次出現</option>
        </select>
        <button type="button" className="secondary-button" onClick={() => void addCategory()}>＋新增分類</button>
      </div>
      {!categories.length && <p className="muted category-editor-empty">尚未建立分類。快速標籤仍會在錄音中自動編號。</p>}
    </div>
  );
}
