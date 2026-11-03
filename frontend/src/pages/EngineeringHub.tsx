import { useState } from "react";
import { CheckCircle2, CircleAlert, CircleX, FileText, ShieldCheck, Siren } from "lucide-react";
import { useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtTime } from "../lib/format";
import { DocDrawer, DocView } from "../components/Markdown";
import { Badge, Card, CardHeader, Note, QueryBoundary, Segmented, cn } from "../components/ui";

interface Suite { file: string; total: number; passed: number; failed: number; skipped: number; generated_at: string;
  cases: { name: string; classname: string; time_s: number; status: string }[] }
interface TestResults { meta: { commit?: string; generated_at?: string; dirty?: boolean; runner?: string }; suites: Record<string, Suite | null>; how_generated: string }
interface Ops {
  as_of: string; services: { name: string; status: string; detail?: string; last_error?: string | null }[];
  alert_rules: { id: string; name: string; origin: string; value: string; firing: boolean }[];
  recent_errors: { at: string; request_id: string; route: string; type: string }[]; retry_policy: string;
}

export function TestResultsCard() {
  const q = useApi<TestResults>(["test-results"], "/api/engineering/test-results");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Automated test results" subtitle={q.data ? `Commit ${q.data.meta.commit ?? "?"}${q.data.meta.dirty ? " (uncommitted changes)" : ""} · generated ${fmtTime(q.data.meta.generated_at)} · ${q.data.how_generated}` : undefined} />
      <QueryBoundary q={q}>
        {(d) => (
          <div className="space-y-2 p-4">
            {Object.entries(d.suites).map(([name, s]) => (
              <div key={name} className="rounded-lg border border-black/10 bg-white">
                <button className="flex w-full items-center justify-between px-3 py-2 text-left" onClick={() => setOpen(open === name ? null : name)} aria-expanded={open === name}>
                  <span className="text-sm font-semibold capitalize">{name}</span>
                  {s ? (
                    <span className="flex items-center gap-2 text-xs">
                      {s.failed === 0 ? <Badge className="border-good/40 bg-good/5 text-good-text"><CheckCircle2 size={12} /> {s.passed}/{s.total} passed</Badge>
                        : <Badge className="border-crit/40 bg-crit/5 text-crit"><CircleX size={12} /> {s.failed} failed</Badge>}
                      <code className="text-muted">{s.file.split("/").pop()}</code>
                    </span>
                  ) : <span className="text-xs text-muted">no results file — run scripts/collect_evidence.sh</span>}
                </button>
                {open === name && s && (
                  <ul className="max-h-72 overflow-auto border-t border-black/5 px-3 py-2 text-[11.5px]">
                    {s.cases.map((c) => (
                      <li key={c.classname + c.name} className="flex justify-between gap-2 py-0.5">
                        <span className={cn(c.status !== "passed" && "text-crit")}>{c.status === "passed" ? "✓" : "✗"} {c.name}</span>
                        <span className="tabular text-muted">{c.time_s.toFixed(2)} s</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
    </Card>
  );
}

function RoleMatrix() {
  const q = useApi<{ roles: string[]; permissions: Record<string, boolean | string>[] }>(["roles"], "/api/engineering/roles");
  return (
    <Card>
      <CardHeader title="Access matrix (live from the server)" subtitle="Source of truth: backend/app/auth.py → PERMISSIONS. Enforced on every route; tested per role." />
      <QueryBoundary q={q}>
        {(d) => (
          <div className="overflow-x-auto p-4">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-black/10 text-left text-ink-2"><th className="py-1.5 font-medium">Permission</th>{d.roles.map((r) => <th key={r} className="px-2 text-center font-medium">{r}</th>)}</tr></thead>
              <tbody>
                {d.permissions.map((p) => (
                  <tr key={String(p.permission)} className="border-b border-black/5">
                    <td className="py-1"><code>{String(p.permission)}</code></td>
                    {d.roles.map((r) => <td key={r} className="text-center">{p[r] ? <span aria-label="allowed" className="text-good-text">✓</span> : <span aria-label="denied" className="text-muted">–</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </Card>
  );
}

function Operations() {
  const q = useApi<Ops>(["operations"], "/api/engineering/operations", undefined, { refetchInterval: 10_000 });
  return (
    <QueryBoundary q={q}>
      {(d) => (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Service health" subtitle={`As of ${fmtTime(d.as_of)} · refreshes every 10 s`} />
            <ul className="divide-y divide-black/5 text-sm">
              {d.services.map((s) => (
                <li key={s.name} className="flex items-center justify-between px-4 py-2">
                  <span>{s.name}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-2">
                    {s.detail}
                    <Badge className={s.status === "down" ? "border-crit/40 bg-crit/5 text-crit" : s.status === "stopped" ? "border-black/20 text-ink-2" : "border-good/40 bg-good/5 text-good-text"}>
                      {s.status === "down" ? "✗" : s.status === "stopped" ? "■" : "●"} {s.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Alert rules" subtitle="Evaluated live; each rule cites the incident, ADR or risk it came from" />
            <ul className="divide-y divide-black/5 text-xs">
              {d.alert_rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span><code className="mr-1">{r.id}</code>{r.name} <span className="text-muted">· from {r.origin}</span></span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-ink-2">{r.value}</span>
                    {r.firing ? <Badge className="border-crit/40 bg-crit/5 text-crit"><Siren size={11} /> firing</Badge> : <Badge className="border-good/40 text-good-text">✓ ok</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Recent unhandled errors (no PHI)" subtitle="Request id, route template and exception type only" />
            {d.recent_errors.length === 0 ? <p className="p-4 text-xs text-muted">No unhandled errors since the API started.</p> : (
              <ul className="p-4 text-xs">{d.recent_errors.map((e) => <li key={e.request_id}><code>{e.request_id}</code> {e.route} · {e.type} · {fmtTime(e.at)}</li>)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Retry & recovery" />
            <p className="p-4 text-xs text-ink-2">{d.retry_policy}</p>
          </Card>
        </div>
      )}
    </QueryBoundary>
  );
}

function AllDocs() {
  const q = useApi<{ path: string; title: string; folder: string }[]>(["docs"], "/api/engineering/docs");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Repository documents" subtitle="Rendered from the repository (single source of truth)" />
      <QueryBoundary q={q}>
        {(d) => (
          <div className="grid gap-x-6 p-4 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(d.reduce<Record<string, typeof d>>((acc, x) => ({ ...acc, [x.folder]: [...(acc[x.folder] ?? []), x] }), {})).map(([folder, docs]) => (
              <div key={folder} className="mb-3">
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">docs/{folder === "." ? "" : folder}</h3>
                <ul className="space-y-0.5 text-xs">{docs.map((x) => (
                  <li key={x.path}><button className="inline-flex items-center gap-1 text-left text-brand-dark hover:underline" onClick={() => setOpen(x.path)}><FileText size={12} />{x.title}</button></li>
                ))}</ul>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
      <DocDrawer path={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

const TABS = [
  { value: "team", label: "Team & ownership" }, { value: "delivery", label: "Sprint backlog" }, { value: "architecture", label: "Architecture" },
  { value: "quality", label: "Quality gates" }, { value: "security", label: "Security" }, { value: "operations", label: "Operations" },
  { value: "client", label: "Client updates" }, { value: "hiring", label: "Hiring" }, { value: "docs", label: "All documents" },
];

function DocCard({ path, title }: { path: string; title?: string }) {
  return <Card>{title && <CardHeader title={title} />}<div className="p-4"><DocView path={path} /></div></Card>;
}

export default function EngineeringHub() {
  const { user } = useAuth();
  const [tab, setTab] = useState(() => (location.hash.slice(1) && TABS.some((t) => t.value === location.hash.slice(1)) ? location.hash.slice(1) : "team"));
  const choose = (t: string) => { setTab(t); history.replaceState(null, "", `#${t}`); };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Engineering Hub</h1>
        <p className="text-xs text-muted">How a 10-person Vietnam team delivers CardioWatch for a California healthcare client. Live widgets read the running system and real test results; documents are rendered from the repository.</p>
      </div>
      {user?.role !== "admin" && <Note><ShieldCheck size={12} className="mr-1 inline" />You are signed in with an engineering role: no patient data is accessible to you by design (ADR-006).</Note>}
      <div className="overflow-x-auto"><Segmented label="Engineering Hub section" value={tab} onChange={choose} options={TABS} /></div>
      {tab === "team" && <DocCard path="docs/engineering/TEAM_STRUCTURE.md" />}
      {tab === "delivery" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <DocCard path="docs/engineering/SPRINT_PLAN.md" />
          <DocCard path="docs/delivery/BACKLOG.md" />
        </div>
      )}
      {tab === "architecture" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <DocCard path="docs/engineering/SYSTEM_ARCHITECTURE.md" />
          <div className="space-y-4">
            <DocCard path="docs/engineering/AWS_DEPLOYMENT.md" />
            <Card><CardHeader title="API contract" /><p className="p-4 text-xs text-ink-2">OpenAPI generated from code: <a className="text-brand-dark underline" href="/docs" target="_blank" rel="noreferrer">interactive docs</a> (API server) and <code>docs/engineering/api/openapi.json</code>. ADRs are in the Knowledge Hub (category "Architecture decision records").</p></Card>
          </div>
        </div>
      )}
      {tab === "quality" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4"><TestResultsCard /><DocCard path=".github/pull_request_template.md" title="Pull-request template" /></div>
          <DocCard path="docs/engineering/ENGINEERING_STANDARDS.md" />
        </div>
      )}
      {tab === "security" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <RoleMatrix />
          <DocCard path="docs/engineering/SECURITY_COMPLIANCE.md" />
        </div>
      )}
      {tab === "operations" && (<><Operations /><DocCard path="docs/engineering/RUNBOOK.md" /></>)}
      {tab === "client" && <DocCard path="docs/engineering/CLIENT_COLLABORATION.md" />}
      {tab === "hiring" && <DocCard path="docs/engineering/HIRING.md" />}
      {tab === "docs" && <AllDocs />}
      <p className="text-[11px] text-muted"><CircleAlert size={11} className="mr-1 inline" />Approvals, the release record and incidents in these documents are simulated examples; code, tests, results and alert evaluations are real.</p>
    </div>
  );
}
