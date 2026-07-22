export function makeId(prefix = "EV") {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
  return `${prefix}-${Date.now()}-${random}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((value) => String(value).padStart(2, "0")).join(":");
}

export function shortId(id: string) {
  return id.split("-").slice(-2).join("-").slice(0, 13).toUpperCase();
}

export function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function safeFileName(value: string) {
  const withoutControls = Array.from(value, (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  ).join("");
  return withoutControls.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}
