import { useState } from "react";
import { MAX_QUICK_TAGS } from "../constants";

export function QuickTagEditor({
  tags,
  onChange,
  flash,
}: {
  tags: string[];
  onChange: (tags: string[]) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [newTag, setNewTag] = useState("");

  async function addTag() {
    const value = newTag.trim();
    if (!value) return;
    if (tags.includes(value)) return flash("這個快捷標籤已存在。");
    if (tags.length >= MAX_QUICK_TAGS) return flash(`快捷標籤最多 ${MAX_QUICK_TAGS} 個。`);
    await onChange([...tags, value]);
    setNewTag("");
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tags.length) return;
    const next = [...tags];
    [next[index], next[target]] = [next[target], next[index]];
    await onChange(next);
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-list">
        {tags.map((tag, index) => (
          <div key={tag}>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
            <strong>{tag}</strong>
            <button onClick={() => move(index, -1)} aria-label={`將 ${tag} 往前`}>↑</button>
            <button onClick={() => move(index, 1)} aria-label={`將 ${tag} 往後`}>↓</button>
            <button className="danger-link" onClick={() => onChange(tags.filter((item) => item !== tag))}>移除</button>
          </div>
        ))}
      </div>
      <div className="tag-add-row">
        <input
          value={newTag}
          maxLength={16}
          placeholder="新增快捷標籤"
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && addTag()}
        />
        <button className="secondary-button" onClick={addTag}>新增</button>
        <small>{tags.length}／{MAX_QUICK_TAGS}</small>
      </div>
    </div>
  );
}
