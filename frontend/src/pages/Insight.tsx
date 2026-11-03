import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, ChevronRight, Cpu, Send, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtTime } from "../lib/format";
import { Badge, Button, Card, CardHeader, Empty, Note, QueryBoundary, Segmented, cn } from "../components/ui";

interface Rec {
  rec_id: number; created_at: string; requested_by: string; question: string; specialist: string; action: string; rationale: string;
  metric: string; target: string; baseline: number; better: string; status: string; decided_by: string | null; decided_at: string | null;
  decision_comment: string | null; outcome: { baseline?: number; current: number | null; delta?: number; improved?: boolean; note: string } | null;
}
interface AskOut {
  question: string; intent: string | null; specialist: string | null; refused: string | null; answer: string; llm_used: boolean;
  llm_note: string | null; unverified_numbers: string[]; evidence: { metrics?: Record<string, unknown> } | null; recommendations: Rec[]; graph: string[];
}
interface Health { llm: { status: string; model: string | null; note?: string }; specialists: Record<string, string>; graph: string[] }

const EXAMPLES = [
  "When are nurses busiest and which shift is slowest to acknowledge?",
  "Which devices need attention?",
  "Is there alarm fatigue from technical alarms?",
  "How is data quality in the last 24 hours?",
  "How did we resolve the duplicate alarm incident?",
  "What dose of metoprolol should the patient take?",
];
const NODE_LABEL: Record<string, string> = {
  understand: "Understand", safety_guard: "Safety guard", run_specialist: "Specialist tool (code)", explain: "Explain (local LLM)",
  number_check: "Number check", save_recommendations: "Save → human approval",
};

function GraphStrip({ nodes, reached }: { nodes: string[]; reached: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]" aria-label="Agent graph">
      {nodes.map((n, i) => (
        <span key={n} className="flex items-center gap-1">
          <span className={cn("rounded-md border px-2 py-1 font-medium", i < reached ? "border-brand bg-brand text-white" : "border-black/15 bg-white text-ink-2")}>{NODE_LABEL[n] ?? n}</span>
          {i < nodes.length - 1 && <ChevronRight size={12} className="text-muted" />}
        </span>
      ))}
    </div>
  );
}

function RecCard({ r }: { r: Rec }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["insight-recs"] });
  const decide = useMutation({ mutationFn: (decision: "approve" | "reject") => api(`/api/insight/recommendations/${r.rec_id}/decision`, { method: "POST", body: JSON.stringify({ decision }) }), onSuccess: refresh });
  const outcome = useMutation({ mutationFn: () => api(`/api/insight/recommendations/${r.rec_id}/outcome`, { method: "POST", body: "{}" }), onSuccess: refresh });
  const o = r.outcome;
  return (
    <li className="rounded-lg border border-black/10 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-muted">#{r.rec_id}</code>
        <Badge className="border-brand/30 bg-brand-soft text-brand-dark">{r.specialist.replace("_", " ")}</Badge>
        {r.status === "proposed" && <Badge className="border-warn/70 bg-warn/10 text-ink">◷ awaiting human approval</Badge>}
        {r.status === "approved" && <Badge className="border-good/40 bg-good/5 text-good-text">✓ approved by {r.decided_by}</Badge>}
        {r.status === "rejected" && <Badge className="border-black/20 text-ink-2">✗ rejected by {r.decided_by}</Badge>}
        <span className="ml-auto text-muted">{fmtTime(r.created_at)}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-ink">{r.action}</p>
      <p className="text-ink-2">{r.rationale}</p>
      <p className="mt-1 text-muted">Measured by <code>{r.metric}</code> for <b>{r.target}</b> · baseline <b className="tabular">{r.baseline}</b> ({r.better} is better)</p>
      {o && (
        <p className={cn("mt-1 flex items-center gap-1 font-medium", o.improved ? "text-good-text" : "text-ink-2")}>
          {o.improved ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
          Outcome: {o.current === null ? o.note : <>now <b className="tabular">{o.current}</b> (Δ {o.delta}) · {o.improved ? "improved" : "not improved"}</>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.status === "proposed" && can("approve_operational") && (
          <>
            <Button size="sm" variant="primary" onClick={() => decide.mutate("approve")}><CheckCircle2 size={12} /> Approve</Button>
            <Button size="sm" onClick={() => decide.mutate("reject")}><XCircle size={12} /> Reject</Button>
          </>
        )}
        {r.status === "proposed" && !can("approve_operational") && <span className="text-muted">Approval: doctor or clinical informatics admin.</span>}
        {r.status === "approved" && <Button size="sm" onClick={() => outcome.mutate()} disabled={outcome.isPending}>Check outcome</Button>}
      </div>
    </li>
  );
}

export default function Insight() {
  const health = useApi<Health>(["insight-health"], "/api/insight/health");
  const [q, setQ] = useState(EXAMPLES[0]);
  const [status, setStatus] = useState("proposed");
  const qc = useQueryClient();
  const ask = useMutation({ mutationFn: (question: string) => api<AskOut>("/api/insight/ask", { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insight-recs"] }) });
  const recs = useApi<{ items: Rec[] }>(["insight-recs"], "/api/insight/recommendations", { status });
  const h = health.data;
  const r = ask.data;
  const reached = !r ? 0 : r.refused ? 2 : 6;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><Bot size={22} className="text-brand" /> CardioInsight</h1>
          <p className="text-xs text-muted">Operational AI assistant: staffing and workload, alarm fatigue, device fleet, data quality, engineering knowledge. Same governed pattern as the SCInsight supply-chain agents.</p>
        </div>
        {h && (h.llm.status === "up"
          ? <Badge className="border-good/40 bg-good/5 text-good-text"><Cpu size={12} /> {h.llm.model} · local · up</Badge>
          : <Badge className="border-black/20 text-ink-2"><Cpu size={12} /> LLM {h.llm.status} · deterministic answers</Badge>)}
      </div>
      <Note tone="warn">Operational only. CardioInsight never diagnoses, suggests treatment or medication, or discusses individual patients. Code calculates every number; the LLM only explains, and any number it cannot trace to the tool output is withheld. Recommendations need human approval.</Note>

      <Card>
        <CardHeader title="Ask" subtitle={h ? <GraphStrip nodes={h.graph} reached={reached} /> : undefined} />
        <div className="space-y-3 p-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask.mutate(q); }}>
            <label htmlFor="insight-q" className="sr-only">Question</label>
            <input id="insight-q" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} className="h-10 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm" />
            <Button variant="primary" disabled={ask.isPending || q.length < 3}><Send size={14} /> {ask.isPending ? "Thinking…" : "Ask"}</Button>
          </form>
          <div className="flex flex-wrap gap-1">{EXAMPLES.map((e) => <button key={e} onClick={() => { setQ(e); ask.mutate(e); }} className="rounded-full border border-black/15 bg-white px-2 py-0.5 text-[11px] text-ink-2 hover:bg-brand-soft">{e}</button>)}</div>
          {ask.isPending && <p className="text-xs text-muted">Running the agent graph{h?.llm.status === "up" ? " — the local model can take 10–30 s on CPU" : ""}…</p>}
          {ask.error && <p role="alert" className="text-xs text-crit">{(ask.error as Error).message}</p>}
          {r && (
            <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {r.refused ? <Badge className="border-crit/40 bg-crit/5 text-crit"><ShieldAlert size={12} /> refused by safety guard</Badge>
                  : <Badge className="border-brand/30 bg-brand-soft text-brand-dark">{r.specialist}</Badge>}
                {!r.refused && (r.llm_used
                  ? <Badge className="border-good/40 bg-good/5 text-good-text"><ShieldCheck size={12} /> written by {r.llm_note} · all numbers verified</Badge>
                  : <Badge className="border-black/20 text-ink-2">{r.llm_note}</Badge>)}
              </div>
              <p className="whitespace-pre-line text-sm text-ink">{r.answer}</p>
              {r.evidence?.metrics && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-brand-dark">Evidence computed by code (the only numbers the LLM may use)</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-plane p-2 text-[11px]">{JSON.stringify(r.evidence.metrics, null, 2)}</pre>
                </details>
              )}
              {r.recommendations.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold">Recommendations (advisory, saved for approval)</h3>
                  <ul className="space-y-2">{r.recommendations.map((x) => <RecCard key={x.rec_id} r={x} />)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Recommendation log" subtitle="Approve or reject (doctor / clinical informatics admin), then check the outcome against the baseline"
          right={<Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "proposed", label: "Awaiting approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />} />
        <div className="p-4">
          <QueryBoundary q={recs} empty={(d) => d.items.length === 0}>
            {(d) => <ul className="space-y-2">{d.items.map((x) => <RecCard key={x.rec_id} r={x} />)}</ul>}
          </QueryBoundary>
          {recs.data?.items.length === 0 && <Empty>No recommendations with this status yet.</Empty>}
        </div>
      </Card>
    </div>
  );
}
