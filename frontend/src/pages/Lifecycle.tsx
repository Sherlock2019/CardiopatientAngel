import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCircle2, CircleDashed, FileCode2, FileText, Search } from "lucide-react";
import { api, useApi } from "../lib/api";
import { fmtTime } from "../lib/format";
import { DocDrawer } from "../components/Markdown";
import { Badge, Button, Card, CardHeader, QueryBoundary, cn } from "../components/ui";
import type { AskResult } from "./KnowledgeHub";
import { AskResultView } from "./KnowledgeHub";

interface Stage { key: string; name: string; owner: string; inputs: string[]; outputs: string[]; gate: string; artifacts: { path: string; exists: boolean }[] }
interface Trace {
  title: string; requirement: { id: string; text: string; doc: string }; stories: string[]; adr: { id: string; doc: string };
  code: { path: string; symbol: string; line: number | null }[]; tests: { name: string; status: string }[];
  ci: { workflow: string; evidence: { commit?: string; generated_at?: string; dirty?: boolean }; note: string };
  deployment: { id: string; doc: string; simulated: boolean }; incident: string;
  monitoring: { simulator_duplicates_ignored: number; simulator_readings_ingested: number; quality_last_24h: Record<string, number>; alert_rule: string };
  knowledge_records: { knowledge_id: string; title: string | null; status: string }[]; reuse_events_for_feature_knowledge: number;
  future_feature: { id: string; title: string; question: string };
}

function Step({ n, title, children, done = true, simulated = false }: { n: number; title: string; children: React.ReactNode; done?: boolean; simulated?: boolean }) {
  return (
    <li className="relative pl-9">
      <span className={cn("absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-brand text-white" : "border border-black/20 bg-white text-ink-2")}>{n}</span>
      <div className="flex items-center gap-2 text-sm font-semibold">{title}{simulated && <Badge className="border-warn/70 bg-warn/10 text-ink">simulated</Badge>}</div>
      <div className="mt-1 pb-5 text-xs text-ink-2">{children}</div>
    </li>
  );
}

export default function Lifecycle() {
  const q = useApi<{ stages: Stage[]; feature: Trace; simulated_items: string[] }>(["lifecycle"], "/api/engineering/lifecycle");
  const [doc, setDoc] = useState<{ path: string; line?: number | null } | null>(null);
  const [stage, setStage] = useState("requirements");
  const qc = useQueryClient();
  const ask = useMutation({ mutationFn: (question: string) => api<AskResult>("/api/knowledge/ask", { params: { q: question, feature: "CW-205" } }) });
  const reuse = useMutation({
    mutationFn: (id: string) => api(`/api/knowledge/${id}/reuse`, { method: "POST", body: JSON.stringify({ feature: "CW-205", context: "applied before implementation" }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lifecycle"] }); qc.invalidateQueries({ queryKey: ["kb-metrics"] }); },
  });
  const open = (path: string, line?: number | null) => setDoc({ path, line });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Engineering Lifecycle</h1>
        <p className="text-xs text-muted">Seven stages, one feature traced end to end with real repository artifacts and test results. Knowledge compounding (stage 7) feeds every other stage.</p>
      </div>
      <QueryBoundary q={q}>
        {(d) => {
          const s = d.stages.find((x) => x.key === stage)!;
          const f = d.feature;
          return (
            <>
              <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7" role="tablist" aria-label="Lifecycle stages">
                {d.stages.map((x) => (
                  <button key={x.key} role="tab" aria-selected={stage === x.key} onClick={() => setStage(x.key)}
                    className={cn("rounded-lg border p-2.5 text-left text-xs", stage === x.key ? "border-brand bg-brand-soft" : "border-black/10 bg-white hover:bg-brand-soft/50", x.key === "knowledge" && "ring-1 ring-brand/30")}>
                    <div className="font-semibold">{x.name}</div>
                    <div className="mt-1 text-[11px] text-muted">{x.owner}</div>
                  </button>
                ))}
              </div>
              <Card>
                <CardHeader title={s.name} subtitle={`Owner: ${s.owner}`} />
                <div className="grid gap-4 p-4 text-xs md:grid-cols-4">
                  <div><h3 className="mb-1 font-semibold">Inputs</h3><ul className="list-disc pl-4 text-ink-2">{s.inputs.map((i) => <li key={i}>{i}</li>)}</ul></div>
                  <div><h3 className="mb-1 font-semibold">Outputs</h3><ul className="list-disc pl-4 text-ink-2">{s.outputs.map((i) => <li key={i}>{i}</li>)}</ul></div>
                  <div><h3 className="mb-1 font-semibold">Quality / approval gate</h3><p className="text-ink-2">{s.gate}</p></div>
                  <div><h3 className="mb-1 font-semibold">Linked artifacts</h3>
                    <ul className="space-y-0.5">{s.artifacts.map((a) => (
                      <li key={a.path}>{a.exists ? <button className="text-left text-brand-dark hover:underline" onClick={() => open(a.path)}><FileText size={11} className="mr-1 inline" />{a.path}</button>
                        : <span className="text-crit">✗ missing: {a.path}</span>}</li>
                    ))}</ul>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title={`Feature trace: “${f.title}”`} subtitle="Every link below opens the real file or reads live data, except items marked simulated." />
                <ol className="p-5">
                  <Step n={1} title={`Requirement ${f.requirement.id} → stories ${f.stories.join(", ")}`}>
                    {f.requirement.text}. <button className="text-brand-dark underline" onClick={() => open(f.requirement.doc)}>REQUIREMENTS.md</button> · <button className="text-brand-dark underline" onClick={() => open("docs/delivery/BACKLOG.md")}>backlog</button>
                  </Step>
                  <Step n={2} title={`Architecture decision ${f.adr.id}`}>
                    Idempotent ingestion keyed on device natural keys. <button className="text-brand-dark underline" onClick={() => open(f.adr.doc)}>Open ADR</button>
                  </Step>
                  <Step n={3} title="Implementation">
                    <ul className="space-y-0.5">{f.code.map((c) => (
                      <li key={c.path + c.symbol}><button className="text-brand-dark hover:underline" onClick={() => open(c.path, c.line)}><FileCode2 size={11} className="mr-1 inline" />{c.path}:{c.line ?? "?"}</button> <code>{c.symbol}</code></li>
                    ))}</ul>
                  </Step>
                  <Step n={4} title="Automated tests (real JUnit results)">
                    <ul className="space-y-0.5">{f.tests.map((t) => (
                      <li key={t.name}>{t.status === "passed" ? <CheckCircle2 size={12} className="mr-1 inline text-good" /> : <CircleDashed size={12} className="mr-1 inline text-crit" />}<code>{t.name}</code> — {t.status}</li>
                    ))}</ul>
                  </Step>
                  <Step n={5} title="CI build & verification">
                    Commit <code>{f.ci.evidence.commit ?? "?"}</code>{f.ci.evidence.dirty ? " (+ uncommitted changes)" : ""}, results generated {fmtTime(f.ci.evidence.generated_at)}. {f.ci.note} <button className="text-brand-dark underline" onClick={() => open(f.ci.workflow)}>ci.yml</button>
                  </Step>
                  <Step n={6} title={`Deployment record ${f.deployment.id}`} simulated={f.deployment.simulated}>
                    Canary release with rollback plan. <button className="text-brand-dark underline" onClick={() => open(f.deployment.doc)}>DEPLOYMENT.md</button> · runs locally as a production-like Docker Compose stack.
                  </Step>
                  <Step n={7} title="Monitoring evidence (live)">
                    Simulator: {f.monitoring.simulator_readings_ingested} readings ingested, {f.monitoring.simulator_duplicates_ignored} duplicates ignored ·
                    last 24 h quality: {Object.entries(f.monitoring.quality_last_24h).map(([k, v]) => `${v} ${k}`).join(", ") || "—"} · alert {f.monitoring.alert_rule} (<Link className="text-brand-dark underline" to="/engineering#operations">Operations</Link>)
                  </Step>
                  <Step n={8} title={`Incident ${f.incident} → root cause → fix`} simulated>
                    Gateway retries carried new message ids; fixed by ADR-003, regression test and alert ALR-001. <button className="text-brand-dark underline" onClick={() => open("docs/engineering/INCIDENT_POSTMORTEM.md")}>Postmortem</button>
                  </Step>
                  <Step n={9} title="Reusable knowledge (approved)">
                    <ul className="space-y-0.5">{f.knowledge_records.map((k) => (
                      <li key={k.knowledge_id}><Link className="text-brand-dark hover:underline" to={`/knowledge?id=${k.knowledge_id}`}><BookOpenCheck size={11} className="mr-1 inline" />{k.knowledge_id}</Link> {k.title} <Badge className="border-good/40 text-good-text">{k.status}</Badge></li>
                    ))}</ul>
                    <div className="mt-1">Reuse events recorded for this knowledge: <b className="tabular">{f.reuse_events_for_feature_knowledge}</b></div>
                  </Step>
                </ol>
              </Card>

              <Card>
                <CardHeader title={`Knowledge compounding: next feature ${f.future_feature.id} — ${f.future_feature.title}`}
                  subtitle="Before implementation starts, the engineer asks the Knowledge Hub. The lesson from INC-2026-014 comes back with citations." />
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-brand-soft px-2 py-1 text-xs">{f.future_feature.question}</code>
                    <Button size="sm" variant="primary" onClick={() => ask.mutate(f.future_feature.question)} disabled={ask.isPending}><Search size={12} /> Ask before building</Button>
                  </div>
                  {ask.data && (
                    <>
                      <AskResultView r={ask.data} />
                      <div className="flex flex-wrap gap-2">
                        {ask.data.citations.map((c) => (
                          <Button key={c.knowledge_id} size="sm" onClick={() => reuse.mutate(c.knowledge_id)} disabled={reuse.isPending}>
                            Apply {c.knowledge_id} to {f.future_feature.id}
                          </Button>
                        ))}
                      </div>
                      {reuse.isSuccess && <p className="text-xs text-good-text">✓ Reuse recorded and audited — see the counter in step 9 and Knowledge Hub metrics.</p>}
                    </>
                  )}
                </div>
              </Card>
              <p className="text-[11px] text-muted">Simulated for the demo: {d.simulated_items.join(" · ")}. Everything else is read from the repository, the database or the latest test run.</p>
            </>
          );
        }}
      </QueryBoundary>
      <DocDrawer path={doc?.path ?? null} line={doc?.line} onClose={() => setDoc(null)} />
    </div>
  );
}
