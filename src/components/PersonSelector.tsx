import type { PersonDefinition } from "../types";

export function PersonSelector({
  people,
  value,
  onChange,
  label = "人物",
}: {
  people: PersonDefinition[];
  value: string | null;
  onChange: (personId: string | null) => void;
  label?: string;
}) {
  return (
    <label className="person-selector">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">未指定</option>
        {people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
      </select>
    </label>
  );
}
