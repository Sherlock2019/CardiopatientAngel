import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApi } from "../lib/api";
import { fmtTime } from "../lib/format";
import { Button, ErrorState, Loading } from "./ui";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/** Renders a repository file (markdown or source) fetched through the guarded /api/engineering/source endpoint. */
export function DocView({ path, highlight }: { path: string; highlight?: number | null }) {
  const q = useApi<{ path: string; content: string; modified_at: string }>(["source", path], "/api/engineering/source", { path });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight && ref.current) ref.current.querySelector(`[data-line="${highlight}"]`)?.scrollIntoView({ block: "center" });
  }, [q.data, highlight]);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data!;
  return (
    <div ref={ref}>
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <code>{d.path}</code>
        <span>updated {fmtTime(d.modified_at)}</span>
      </div>
      {d.path.endsWith(".md") ? (
        <Markdown>{d.content}</Markdown>
      ) : (
        <pre className="overflow-auto rounded-md border border-black/10 bg-white text-[11.5px] leading-5">
          {d.content.split("\n").map((ln, i) => (
            <div key={i} data-line={i + 1} className={i + 1 === highlight ? "bg-warn/25" : undefined}>
              <span className="inline-block w-10 select-none pr-2 text-right text-muted">{i + 1}</span>
              {ln}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/** Side drawer showing a repository document or source file. */
export function DocDrawer({ path, line, onClose }: { path: string | null; line?: number | null; onClose: () => void }) {
  if (!path) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose} role="dialog" aria-modal="true" aria-label={path}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex justify-end"><Button size="sm" variant="ghost" onClick={onClose} aria-label="Close document"><X size={14} /> Close</Button></div>
        <DocView path={path} highlight={line} />
      </div>
    </div>
  );
}
