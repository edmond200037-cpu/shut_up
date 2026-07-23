import { useState } from "react";
import type { PersonDefinition } from "../types";
import { makeId } from "../lib/format";

export function PersonEditor({
  people,
  onChange,
  onDelete,
  flash,
}: {
  people: PersonDefinition[];
  onChange: (people: PersonDefinition[]) => Promise<void>;
  onDelete: (person: PersonDefinition) => Promise<void>;
  flash: (message: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  async function addPerson() {
    const name = newName.trim();
    if (!name) return flash("請輸入人物名稱。");
    if (people.some((person) => person.name === name)) return flash("這個人物名稱已存在。");
    await onChange([...people, { id: makeId("PERSON"), name }]);
    setNewName("");
    flash(`已新增人物「${name}」。`);
  }

  async function updatePerson(person: PersonDefinition, name: string) {
    const nextName = name.trim();
    if (!nextName || nextName === person.name) return;
    if (people.some((item) => item.id !== person.id && item.name === nextName)) return flash("這個人物名稱已存在。");
    await onChange(people.map((item) => item.id === person.id ? { ...item, name: nextName } : item));
  }

  return (
    <div className="person-editor">
      <div className="person-editor-head"><span>人物名稱</span><span>操作</span></div>
      <div className="person-editor-list">
        {people.map((person, index) => (
          <div className="person-editor-row" key={person.id}>
            <span className="person-index">{String(index + 1).padStart(2, "0")}</span>
            <input
              aria-label={`${person.name} 人物名稱`}
              value={draftNames[person.id] ?? person.name}
              disabled={editingId !== person.id}
              onChange={(event) => setDraftNames((current) => ({ ...current, [person.id]: event.target.value }))}
              onBlur={() => {
                const name = draftNames[person.id] ?? person.name;
                setDraftNames((current) => { const next = { ...current }; delete next[person.id]; return next; });
                void updatePerson(person, name);
              }}
            />
            <div className="person-actions"><button type="button" className="secondary-button" onClick={() => setEditingId(editingId === person.id ? null : person.id)}>{editingId === person.id ? "完成" : "編輯"}</button><button type="button" className="danger-link" onClick={() => void onDelete(person)}>刪除</button></div>
          </div>
        ))}
      </div>
      <div className="person-add-row">
        <input value={newName} placeholder="新增人物名稱" aria-label="新增人物名稱" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addPerson()} />
        <button type="button" className="secondary-button" onClick={() => void addPerson()}>＋新增人物</button>
      </div>
      {!people.length && <p className="muted person-editor-empty">尚未建立人物；證據仍可先歸入「未指定」。</p>}
    </div>
  );
}
