export function ChangelogModal({
  version,
  notes,
  url,
  onClose,
}: {
  version: string;
  notes: string;
  url?: string;
  onClose: () => void;
}) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h3>更新到 {version.replace(/^v/, "v")}</h3>
        <pre className="license">{notes || "（无更新说明）"}</pre>
        {url && (
          <a href={url} target="_blank" rel="noreferrer">
            完整 release 链接
          </a>
        )}
        <button className="send" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  );
}