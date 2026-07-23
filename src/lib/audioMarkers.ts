import type { AudioMarker } from "../types";

export const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

export function markerName(marker: AudioMarker, index: number) {
  return marker.category || `快速${CIRCLED_NUMBERS[index] || index + 1}`;
}
