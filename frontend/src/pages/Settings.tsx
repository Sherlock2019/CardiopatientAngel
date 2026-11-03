import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMeta } from "../lib/meta";
import { fmtTime } from "../lib/format";
import { Button, Card, CardHeader, DataTable, Note, QueryBoundary, Select } from "../components/ui";

interface S {
  display_timezone: string; repeat_window_minutes: number; small_cohort_patients: number; suppress_cohort_patients: number;
  attention: { severity_points: Record<string, number>; recent_window_hours: number; points_per_recent_alarm: number; recent_cap: number; points_per_minute_unacknowledged: number; unacknowledged_cap: number; points_per_repeat: number; repeat_cap: number };
}

function AuditLog() {
  const q = useApi<{ audit_id: number; occurred_at: string; username: string; role: string; action: string; resource_type: string; resource_id: string; details: string | null }[]>(["audit"], "/api/audit", { limit: 100 });
  return (
    <Card>
      <CardHeader title="Audit log" subtitle="Patient-record access, alarm acknowledgment/review, simulator and settings changes" />
      <QueryBoundary q={q} empty={(d) => d.length === 0}>
        {(d) => <div className="max-h-96 overflow-auto"><DataTable rows={d} columns={[
          { key: "occurred_at", label: "Time", fmt: (v) => fmtTime(v) }, { key: "username", label: "User" }, { key: "role", label: "Role" },
          { key: "action", label: "Action" }, { key: "resource_type", label: "Resource" }, { key: "resource_id", label: "ID" }, { key: "details", label: "Details" },
        ]} /></div>}
      </QueryBoundary>
    </Card>
  );
}

export default function Settings() {
  const { can, user } = useAuth();
  const meta = useMeta();
  const qc = useQueryClient();
  const q = useApi<S>(["settings"], "/api/settings");
  const [draft, setDraft] = useState<S | null>(null);
  useEffect(() => { if (q.data) setDraft(structuredClone(q.data)); }, [q.data]);
  const save = useMutation({
    mutationFn: (body: S) => api<S>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const reset = useMutation({ mutationFn: () => api<S>("/api/settings/reset", { method: "POST" }), onSuccess: () => qc.invalidateQueries() });
  const admin = can("manage_settings");
  const num = (v: number, set: (n: number) => void, label: string) => (
    <label className="text-xs"><span className="text-ink-2">{label}</span>
      <input type="number" value={v} disabled={!admin} onChange={(e) => set(Number(e.target.value))} className="mt-1 h-8 w-full rounded-md border border-black/15 bg-white px-2 disabled:bg-black/[0.03]" />
    </label>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      {!admin && <Note>Signed in as {user?.role}. Settings are read-only; an administrator can change them.</Note>}
      {draft && (
        <Card>
          <CardHeader title="Analytics & display" right={admin && (
            <>
              <Button size="sm" variant="ghost" onClick={() => reset.mutate()}>Restore defaults</Button>
              <Button size="sm" variant="primary" onClick={() => save.mutate(draft)} disabled={save.isPending}>Save</Button>
            </>
          )} />
          <div className="grid gap-4 p-4 md:grid-cols-4">
            <Select label="Display timezone" value={draft.display_timezone} disabled={!admin} onChange={(e) => setDraft({ ...draft, display_timezone: e.target.value })}>
              {meta.data?.timezones.map((t) => <option key={t}>{t}</option>)}
            </Select>
            {num(draft.repeat_window_minutes, (n) => setDraft({ ...draft, repeat_window_minutes: n }), "Repeat-alarm window (min)")}
            {num(draft.small_cohort_patients, (n) => setDraft({ ...draft, small_cohort_patients: n }), "Flag cohorts smaller than (patients)")}
            {num(draft.suppress_cohort_patients, (n) => setDraft({ ...draft, suppress_cohort_patients: n }), "Suppress rates below (patients)")}
          </div>
          <div className="border-t border-black/5 p-4">
            <h3 className="text-xs font-semibold">Operational Attention Indicator — Demo Only</h3>
            <p className="mb-3 text-[11px] text-muted">Additive points from operational alarm facts. Not a clinically validated risk score; never used to predict deterioration, mortality or medication safety.</p>
            <div className="grid gap-4 md:grid-cols-4">
              {(["critical", "warning", "advisory"] as const).map((s) => num(draft.attention.severity_points[s], (n) => setDraft({ ...draft, attention: { ...draft.attention, severity_points: { ...draft.attention.severity_points, [s]: n } } }), `Points: unresolved ${s}`))}
              {num(draft.attention.recent_window_hours, (n) => setDraft({ ...draft, attention: { ...draft.attention, recent_window_hours: n } }), "Recent window (h)")}
              {num(draft.attention.points_per_recent_alarm, (n) => setDraft({ ...draft, attention: { ...draft.attention, points_per_recent_alarm: n } }), "Points per recent alarm")}
              {num(draft.attention.recent_cap, (n) => setDraft({ ...draft, attention: { ...draft.attention, recent_cap: n } }), "Recent-alarm cap")}
              {num(draft.attention.points_per_minute_unacknowledged, (n) => setDraft({ ...draft, attention: { ...draft.attention, points_per_minute_unacknowledged: n } }), "Points per unacknowledged minute")}
              {num(draft.attention.unacknowledged_cap, (n) => setDraft({ ...draft, attention: { ...draft.attention, unacknowledged_cap: n } }), "Unacknowledged cap")}
              {num(draft.attention.points_per_repeat, (n) => setDraft({ ...draft, attention: { ...draft.attention, points_per_repeat: n } }), "Points per repeat alarm")}
              {num(draft.attention.repeat_cap, (n) => setDraft({ ...draft, attention: { ...draft.attention, repeat_cap: n } }), "Repeat cap")}
            </div>
          </div>
          {save.error && <p role="alert" className="px-4 pb-3 text-xs text-crit">{(save.error as Error).message}</p>}
        </Card>
      )}
      <Card>
        <CardHeader title="Data notes — intentionally injected synthetic patterns" subtitle="Every pattern the analytics can “discover” was put there on purpose" />
        <div className="grid gap-4 p-4 text-xs md:grid-cols-2">
          <div><h3 className="mb-1 font-semibold">Alarm patterns</h3><ul className="list-disc space-y-1 pl-4 text-ink-2">{meta.data?.injected_patterns.map((p) => <li key={p}>{p}</li>)}</ul></div>
          <div><h3 className="mb-1 font-semibold">Outcome patterns</h3><ul className="list-disc space-y-1 pl-4 text-ink-2">{meta.data?.injected_outcome_patterns.map((p) => <li key={p}>{p}</li>)}</ul></div>
        </div>
      </Card>
      {can("view_audit") && <AuditLog />}
    </div>
  );
}
