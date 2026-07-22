import { useEffect, useMemo } from "react";
import type { EvidenceRecord } from "../types";

export function MediaPreview({ record }: { record: EvidenceRecord }) {
  const url = useMemo(() => URL.createObjectURL(record.blob), [record.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  if (record.kind === "audio") {
    return <audio controls preload="metadata" src={url} />;
  }
  return <img className="detail-image" src={url} alt={record.title} />;
}
