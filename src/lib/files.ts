export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function sha256(blob: Blob) {
  if (!crypto.subtle) return undefined;
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function fileOccurredAt(file: File) {
  const candidate = file.lastModified > 0 ? new Date(file.lastModified) : new Date();
  return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
}
