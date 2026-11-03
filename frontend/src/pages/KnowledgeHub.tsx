import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Lock, Search, Send, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtTime } from "../lib/format";
import { Markdown } from "../components/Markdown";
import { Badge, Button, Card, CardHeader, Empty, Note, QueryBoundary, Segmented, Select, Stat, cn } from "../components/ui";

interface Rec {
  knowledge_id: string; title: string; category: string; summary: string; approval_status: string; version: number;
  access_classification: string; owner: string; reviewer: string | null; related_feature: string | null; source_type: string;
  source_reference: string | null; tags: string[]; review_due: boolean; established_guidance: boolean; updated_at: string;
  created_at: string; review_due_at: string | null; superseded_by: string | null; redaction_notes: string | null; content?: string;
}
interface Hit { knowledge_id: string; title: string; summary: string; approval_status: string; version: number; snippet: string; coverage: number; review_due: boolean; access_classification: string }
export interface AskResult { question: string; confidence: string; answer: string; citations: Hit[]; weak_matches: Hit[]; not_established_guidance: Hit[]; uncovered_terms: string[]; method: string }

export function StatusBadge({ s, due }: { s: string; due?: boolean }) {
  if (due) return <Badge className="border-warn/70 bg-warn/15 text-ink"><TriangleAlert size={11} /> review due</Badge>;
  const m: Record<string, string> = {
    approved: "border-good/40 bg-good/5 text-good-text", in_review: "border-brand/40 bg-brand-soft text-brand-dark",
    draft: "border-dashed border-black/30 text-ink-2", rejected: "border-crit/40 bg-crit/5 text-crit", deprecated: "border-black/30 bg-black/[0.04] text-ink-2 line-through",
  };
  const label: Record<string, string> = { approved: "✓ approved", in_review: "◐ in review", draft: "✎ draft", rejected: "✗ rejected", deprecated: "deprecated" };
  return <Badge className={m[s]}>{label[s] ?? s}</Badge>;
}

const CONF: Record<string, string> = { high: "border-good/40 bg-good/5 text-good-text", medium: "border-brand/40 bg-brand-soft text-brand-dark", low: "border-warn/70 bg-warn/15 text-ink", insufficient: "border-crit/40 bg-crit/5 text-crit" };

function Snippet({ s }: { s: string }) {
  return <span>{s.split(/(«[^»]*»)/).map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-warn/30 px-0.5">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</span>;
}

export function AskResultView({ r, onOpen }: { r: AskResult; onOpen?: (id: string) => void }) {
  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-white p-3 text-xs">
      <div className="flex items-center gap-2">
        <Badge className={CONF[r.confidence]}>confidence: {r.confidence}</Badge>
        <span className="text-muted">{r.method}</span>
      </div>
      <p className="whitespace-pre-line text-[13px] text-ink">{r.answer}</p>
      {r.citations.length > 0 && (
        <div>
          <h4 className="mb-1 font-semibold">Citations</h4>
          <ol className="space-y-1.5">{r.citations.map((c, i) => (
            <li key={c.knowledge_id} className="rounded border border-black/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">[{i + 1}]</span>
                <button className="font-medium text-brand-dark hover:underline" onClick={() => onOpen?.(c.knowledge_id)}>{c.knowledge_id} v{c.version}</button>
                <span>{c.title}</span><StatusBadge s={c.approval_status} due={c.review_due} />
                <span className="text-muted">term coverage {Math.round(c.coverage * 100)}%</span>
              </div>
              <div className="mt-1 text-ink-2"><Snippet s={c.snippet} /></div>
            </li>
          ))}</ol>
        </div>
      )}
      {r.uncovered_terms.length > 0 && <p className="text-ink-2">Terms no approved record covers: {r.uncovered_terms.map((t) => <code key={t} className="mr-1">{t}</code>)}</p>}
      {r.weak_matches.length > 0 && <p className="text-ink-2">Weak matches (not used as evidence): {r.weak_matches.map((w) => w.knowledge_id).join(", ")}</p>}
      {r.not_established_guidance.length > 0 && (
        <div className="rounded border border-dashed border-black/20 p-2">
          <h4 className="mb-1 font-semibold">Also matched, but not established guidance</h4>
          <ul>{r.not_established_guidance.map((c) => <li key={c.knowledge_id} className="flex items-center gap-2"><button className="text-brand-dark hover:underline" onClick={() => onOpen?.(c.knowledge_id)}>{c.knowledge_id}</button> {c.title} <StatusBadge s={c.approval_status} /></li>)}</ul>
        </div>
      )}
    </div>
  );
}

const EXAMPLES = [
  "How did we resolve duplicated cardiac monitoring alarms?",
  "What is our approved API authentication pattern?",
  "Which regression tests are required before deploying the cardiac ingestion service?",
  "What lessons did we learn from the last release?",
  "What is the parking policy?",
];

function Assistant({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState(EXAMPLES[0]);
  const ask = useMutation({ mutationFn: (question: string) => api<AskResult>("/api/knowledge/ask", { params: { q: question } }) });
  return (
    <Card>
      <CardHeader title="Engineering assistant" subtitle="Answers only from approved records you are allowed to see, with citations. Says so when the evidence is insufficient. No LLM required." />
      <div className="space-y-3 p-4">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask.mutate(q); }}>
          <label className="sr-only" htmlFor="kb-q">Question</label>
          <input id="kb-q" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 flex-1 rounded-md border border-black/15 bg-white px-3 text-sm" />
          <Button variant="primary" disabled={ask.isPending || q.length < 3}><Search size={14} /> Ask</Button>
        </form>
        <div className="flex flex-wrap gap-1">{EXAMPLES.map((e) => <button key={e} onClick={() => { setQ(e); ask.mutate(e); }} className="rounded-full border border-black/15 bg-white px-2 py-0.5 text-[11px] text-ink-2 hover:bg-brand-soft">{e}</button>)}</div>
        {ask.data && <AskResultView r={ask.data} onOpen={onOpen} />}
      </div>
    </Card>
  );
}

function Detail({ id }: { id: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useApi<Rec & { revisions: { revision_id: number; version: number; changed_at: string; changed_by: string; change_type: string; status_after: string; comment: string | null; content_sha256: string }[]; feedback: { useful: number; not_useful: number }; uses: { event_type: string; username: string; feature: string | null; created_at: string }[] }>(["kb-record", id], `/api/knowledge/${id}`);
  const fb = useMutation({ mutationFn: (useful: boolean) => api(`/api/knowledge/${id}/feedback`, { method: "POST", body: JSON.stringify({ useful }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["kb-record", id] }) });
  const [feature, setFeature] = useState("CW-205");
  const reuse = useMutation({ mutationFn: () => api(`/api/knowledge/${id}/reuse`, { method: "POST", body: JSON.stringify({ feature }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-record", id] }); qc.invalidateQueries({ queryKey: ["kb-metrics"] }); } });
  return (
    <QueryBoundary q={q}>
      {(r) => (
        <Card>
          <CardHeader title={<span className="flex flex-wrap items-center gap-2">{r.knowledge_id} · v{r.version} <StatusBadge s={r.approval_status} due={r.review_due} />{r.access_classification === "restricted" && <Badge className="border-crit/40 text-crit"><Lock size={11} /> restricted</Badge>}</span>}
            subtitle={r.title} />
          <div className="space-y-4 p-4">
            {!r.established_guidance && <Note tone="warn">{r.approval_status === "deprecated" ? `Deprecated${r.superseded_by ? ` — use ${r.superseded_by} instead` : ""}.` : r.review_due ? "Past its review date: confirm before relying on it." : "Not established guidance until approved."}</Note>}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
              {[["Category", r.category], ["Owner", r.owner], ["Reviewer", r.reviewer ?? "—"], ["Access", r.access_classification], ["Feature", r.related_feature ?? "—"], ["Source", r.source_type], ["Updated", fmtDate(r.updated_at)], ["Review due", fmtDate(r.review_due_at)]].map(([k, v]) => (
                <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
            {r.redaction_notes && <p className="text-[11px] text-ink-2">🛡 {r.redaction_notes}</p>}
            <Markdown>{r.content ?? ""}</Markdown>
            <div className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 text-xs">
              <span>Was this useful?</span>
              <Button size="sm" variant="ghost" onClick={() => fb.mutate(true)}><ThumbsUp size={12} /> {r.feedback.useful}</Button>
              <Button size="sm" variant="ghost" onClick={() => fb.mutate(false)}><ThumbsDown size={12} /> {r.feedback.not_useful}</Button>
              {r.approval_status === "approved" && (
                <span className="ml-auto flex items-center gap-1">
                  <label htmlFor="feat" className="text-muted">Apply to feature</label>
                  <input id="feat" value={feature} onChange={(e) => setFeature(e.target.value)} className="h-7 w-24 rounded border border-black/15 px-2" />
                  <Button size="sm" onClick={() => reuse.mutate()} disabled={reuse.isPending}>Record reuse</Button>
                </span>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold">Revision history (append-only)</h3>
              <ol className="space-y-1 text-[11.5px]">{r.revisions.map((v) => (
                <li key={v.revision_id} className="flex flex-wrap gap-x-2"><span className="tabular text-muted">{fmtTime(v.changed_at)}</span><b>{v.change_type}</b><span>v{v.version}</span><span>by {v.changed_by}</span><span className="text-muted">→ {v.status_after}</span>{v.comment && <span className="text-ink-2">“{v.comment}”</span>}<code className="text-muted" title="content SHA-256">{v.content_sha256.slice(0, 10)}</code></li>
              ))}</ol>
            </div>
            {r.uses.length > 0 && <p className="text-[11.5px] text-ink-2">Used {r.uses.length}×: {r.uses.slice(0, 6).map((u) => `${u.event_type}${u.feature ? ` (${u.feature})` : ""} by ${u.username}`).join(" · ")}</p>}
            {can("review_knowledge") && r.approval_status === "in_review" && <ReviewButtons id={r.knowledge_id} />}
          </div>
        </Card>
      )}
    </QueryBoundary>
  );
}

function ReviewButtons({ id }: { id: string }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const m = useMutation({
    mutationFn: (decision: "approve" | "reject") => api(`/api/knowledge/${id}/review`, { method: "POST", body: JSON.stringify({ decision, comment: comment || null }) }),
    onSuccess: () => ["kb-record", "kb-list", "kb-queue", "kb-metrics"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand-soft/40 p-2 text-xs">
      <input aria-label="Review comment" placeholder="Review comment" value={comment} onChange={(e) => setComment(e.target.value)} className="h-8 flex-1 rounded border border-black/15 px-2" />
      <Button size="sm" variant="primary" onClick={() => m.mutate("approve")}><CheckCircle2 size={12} /> Approve</Button>
      <Button size="sm" variant="danger" onClick={() => m.mutate("reject")}>Reject</Button>
      {m.error && <span role="alert" className="text-crit">{(m.error as Error).message}</span>}
    </div>
  );
}

function Submit({ onCreated }: { onCreated: (id: string) => void }) {
  const cats = useApi<{ categories: string[]; source_types: string[] }>(["kb-cats"], "/api/knowledge/categories");
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "Lesson: vendor sandbox returns duplicate uploads on 504",
    summary: "The new vendor's sandbox re-sends the whole batch after a 504; our natural-key dedup absorbed it.",
    content: "During CW-205 we saw the vendor resend batches after HTTP 504. Natural-key idempotency (KB-0001) ignored 312 duplicates. Contact: dev.lead@vendor-example.com, test patient P00042.",
    category: "", source_type: "code_review", related_feature: "CW-205", access_classification: "internal", tags: "duplicate, vendor, retry" });
  const body = { ...f, category: f.category || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), submit_for_review: true };
  const preview = useMutation({ mutationFn: () => api<{ classification: { category: string; confidence: number }; redactions: string[]; content: string }>("/api/knowledge/preview", { method: "POST", body: JSON.stringify(body) }) });
  const create = useMutation({ mutationFn: () => api<Rec>("/api/knowledge", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (r) => { ["kb-list", "kb-queue", "kb-metrics"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onCreated(r.knowledge_id); } });
  const field = (k: keyof typeof f, label: string, area = false) => (
    <label className="block text-xs"><span className="text-ink-2">{label}</span>
      {area ? <textarea value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} rows={4} className="mt-1 w-full rounded-md border border-black/15 bg-white p-2" />
        : <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1 h-8 w-full rounded-md border border-black/15 bg-white px-2" />}
    </label>
  );
  return (
    <Card>
      <CardHeader title="Submit knowledge" subtitle="Classified automatically, scanned for PHI and secrets (redacted before storage), then reviewed by the engineering lead." />
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div className="space-y-2">
          {field("title", "Title")}{field("summary", "Summary", true)}{field("content", "Content (markdown)", true)}
          <div className="flex flex-wrap gap-2">
            <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Auto-classify</option>{cats.data?.categories.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select label="Access" value={f.access_classification} onChange={(e) => setF({ ...f, access_classification: e.target.value })}><option>public</option><option>internal</option><option>restricted</option></Select>
          </div>
          {field("related_feature", "Related feature")}{field("tags", "Tags (comma-separated)")}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => preview.mutate()}>Preview classification &amp; redaction</Button>
            <Button size="sm" variant="primary" onClick={() => create.mutate()} disabled={create.isPending}><Send size={12} /> Submit for review</Button>
          </div>
          {create.error && <p role="alert" className="text-xs text-crit">{(create.error as Error).message}</p>}
        </div>
        <div className="text-xs">
          {preview.data ? (
            <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3">
              <p>Suggested category: <b>{preview.data.classification.category}</b> (confidence {preview.data.classification.confidence})</p>
              <p>Redactions: {preview.data.redactions.length ? preview.data.redactions.map((x) => <Badge key={x} className="mr-1 border-crit/40 text-crit">{x}</Badge>) : "none"}</p>
              <pre className="whitespace-pre-wrap rounded bg-plane p-2 text-[11.5px]">{preview.data.content}</pre>
            </div>
          ) : <Empty>Preview shows what will actually be stored.</Empty>}
        </div>
      </div>
    </Card>
  );
}

export default function KnowledgeHub() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get("id");
  const select = (id: string) => setParams({ id });
  const [tab, setTab] = useState("browse");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const list = useApi<{ items: Rec[] }>(["kb-list"], "/api/knowledge", { category, status });
  const metrics = useApi<{ approved_records: number; linked_to_features: number; retrieval_events: number; reuse_events: number; due_for_review: string[]; repeated_incident_categories: Record<string, number>; onboarding_coverage: { pct: number; covered: string[]; required: string[] }; note: string; by_status: Record<string, number> }>(["kb-metrics"], "/api/knowledge/metrics");
  const cats = useApi<{ categories: string[]; statuses: string[] }>(["kb-cats"], "/api/knowledge/categories");
  const queue = useApi<{ in_review: Rec[]; review_due: Rec[] }>(["kb-queue"], "/api/knowledge/review-queue", undefined, { enabled: can("review_knowledge") });
  const m = metrics.data;
  const tabs = [{ value: "browse", label: "Browse & ask" }, { value: "submit", label: "Submit" }, ...(can("review_knowledge") ? [{ value: "review", label: `Review queue${queue.data ? ` (${queue.data.in_review.length})` : ""}` }] : [])];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Knowledge Hub</h1>
        <p className="text-xs text-muted">ADRs, patterns, guides, runbooks, postmortems and lessons — captured, redacted, reviewed, then reused. Only approved records count as established guidance.</p>
      </div>
      {m && (
        <section aria-label="Knowledge metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Approved records" value={m.approved_records} hint={`${m.by_status.draft} draft · ${m.by_status.in_review} in review · ${m.by_status.deprecated} deprecated`} />
          <Stat label="Linked to features" value={m.linked_to_features} />
          <Stat label="Retrievals / reuses" value={`${m.retrieval_events} / ${m.reuse_events}`} hint="search hits / cited in features" tone="brand" />
          <Stat label="Due for review" value={m.due_for_review.length} hint={m.due_for_review.join(", ") || "none"} />
          <Stat label="Repeated incident categories" value={Object.entries(m.repeated_incident_categories).filter(([, v]) => v > 1).length} hint={Object.entries(m.repeated_incident_categories).map(([k, v]) => `${k} ×${v}`).join(" · ")} />
          <Stat label="Onboarding coverage" value={`${m.onboarding_coverage.pct}%`} hint={`missing: ${m.onboarding_coverage.required.filter((t) => !m.onboarding_coverage.covered.includes(t)).join(", ") || "none"}`} />
        </section>
      )}
      {m && <p className="text-[11px] text-muted">{m.note}</p>}
      <Segmented label="Knowledge Hub section" value={tab} onChange={setTab} options={tabs} />

      {tab === "browse" && (
        <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
          <div className="space-y-4">
            <Assistant onOpen={select} />
            <Card>
              <CardHeader title={`Records${list.data ? ` · ${list.data.items.length}` : ""}`} right={
                <>
                  <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All</option>{cats.data?.categories.map((c) => <option key={c}>{c}</option>)}</Select>
                  <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{cats.data?.statuses.map((c) => <option key={c}>{c}</option>)}</Select>
                </>
              } />
              <QueryBoundary q={list} empty={(d) => d.items.length === 0}>
                {(d) => (
                  <ul className="max-h-[560px] divide-y divide-black/5 overflow-auto">
                    {d.items.map((r) => (
                      <li key={r.knowledge_id}>
                        <button onClick={() => select(r.knowledge_id)} className={cn("w-full px-4 py-2 text-left text-xs hover:bg-brand-soft/40", selected === r.knowledge_id && "bg-brand-soft")}>
                          <div className="flex flex-wrap items-center gap-1.5"><code className="font-semibold">{r.knowledge_id}</code><StatusBadge s={r.approval_status} due={r.review_due} />{r.access_classification === "restricted" && <Lock size={11} aria-label="restricted" />}<span className="text-muted">{r.category}</span></div>
                          <div className="mt-0.5 font-medium text-ink">{r.title}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </QueryBoundary>
            </Card>
          </div>
          {selected ? <Detail id={selected} /> : <Card><Empty><BookOpen size={16} className="mx-auto mb-2" />Select a record or ask a question.</Empty></Card>}
        </div>
      )}
      {tab === "submit" && <Submit onCreated={(id) => { select(id); setTab("browse"); }} />}
      {tab === "review" && (
        <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
          <Card>
            <CardHeader title="Awaiting review" subtitle="Authors cannot approve their own records" />
            <QueryBoundary q={queue} empty={(d) => d.in_review.length === 0 && d.review_due.length === 0}>
              {(d) => (
                <ul className="divide-y divide-black/5 text-xs">
                  {d.in_review.map((r) => <li key={r.knowledge_id}><button className="w-full px-4 py-2 text-left hover:bg-brand-soft/40" onClick={() => select(r.knowledge_id)}><code>{r.knowledge_id}</code> {r.title} <span className="text-muted">by {r.owner}</span></button></li>)}
                  {d.review_due.map((r) => <li key={r.knowledge_id}><button className="w-full px-4 py-2 text-left hover:bg-brand-soft/40" onClick={() => select(r.knowledge_id)}><StatusBadge s="approved" due /> <code>{r.knowledge_id}</code> {r.title}</button></li>)}
                </ul>
              )}
            </QueryBoundary>
          </Card>
          {selected ? <Detail id={selected} /> : <Card><Empty>Select a record to review.</Empty></Card>}
        </div>
      )}
    </div>
  );
}
