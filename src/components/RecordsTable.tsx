import type { EvidenceRecord } from "../types";
import { formatDate, formatDuration } from "../lib/format";

export function RecordsTable({
  records,
  onOpen,
  limit,
}: {
  records: EvidenceRecord[];
  onOpen: (record: EvidenceRecord) => void;
  limit?: number;
}) {
  const items = limit ? records.slice(0, limit) : records;
  return (
    <div className="record-table-wrap">
      <table className="record-table">
        <thead>
          <tr>
            <th>編號</th>
            <th>類型</th>
            <th>內容摘要</th>
            <th>發生時間</th>
            <th>時長／數量</th>
            <th>標籤</th>
            <th>明細</th>
          </tr>
        </thead>
        <tbody>
          {items.map((record, index) => (
            <tr
              key={record.id}
              onClick={() => onOpen(record)}
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && onOpen(record)}
            >
              <td className="mono">{String(index + 1).padStart(3, "0")}</td>
              <td>
                <span className="type-symbol">{record.kind === "audio" ? "●" : "▣"}</span>
                {record.kind === "audio" ? "錄音" : "照片"}
              </td>
              <td>
                <strong>{record.title}</strong>
                <small>{record.notes || "尚未填寫說明"}</small>
              </td>
              <td className="mono">{formatDate(record.occurredAt)}</td>
              <td className="mono">
                {record.kind === "audio" ? formatDuration(record.duration) : "1 張"}
              </td>
              <td>
                {record.tags.length ? (
                  record.tags.slice(0, 2).map((tag) => (
                    <span className="mini-tag" key={tag}>{tag}</span>
                  ))
                ) : (
                  <span className="muted">未標記</span>
                )}
              </td>
              <td>
                <button className="icon-button" aria-label={`開啟 ${record.title}`}>▤</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <div className="empty-state">目前沒有符合條件的紀錄</div>}
    </div>
  );
}
