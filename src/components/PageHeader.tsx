export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">LOCAL EVIDENCE REGISTER</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-meta">
        <span className="mono">
          {new Date().toLocaleDateString("zh-TW", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            weekday: "short",
          })}
        </span>
        <span className="local-badge">▣ 本機模式</span>
      </div>
    </header>
  );
}
