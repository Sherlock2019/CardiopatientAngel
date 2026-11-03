import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { api, useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLive } from "../lib/live";
import { fmtTime } from "../lib/format";
import { Badge, Button, Card, CardHeader, Note, QueryBoundary, SeverityBadge, Stat } from "../components/ui";

interface Status {
  running: boolean; started_at: string | null; interval_seconds: number; patients_per_tick: number; abnormal_probability: number;
  duplicate_probability: number; delayed_probability: number; missing_probability: number; ticks: number;
  measurements_ingested: number; duplicates_ignored: number; alarms_created: number; last_error: string | null;
}

const FIELDS: { key: keyof Status; label: string; min: number; max: number; step: number }[] = [
  { key: "interval_seconds", label: "Tick interval (s)", min: 0.5, max: 60, step: 0.5 },
  { key: "patients_per_tick", label: "Patients per tick", min: 1, max: 50, step: 1 },
  { key: "abnormal_probability", label: "Abnormal reading probability", min: 0, max: 0.5, step: 0.01 },
  { key: "duplicate_probability", label: "Duplicate delivery probability", min: 0, max: 0.5, step: 0.01 },
  { key: "delayed_probability", label: "Delayed delivery probability", min: 0, max: 0.5, step: 0.01 },
  { key: "missing_probability", label: "Signal-loss probability", min: 0, max: 0.5, step: 0.01 },
];

export default function Simulator() {
  const { can } = useAuth();
  const { events, connected } = useLive();
  const qc = useQueryClient();
  const q = useApi<Status>(["sim"], "/api/simulator/status", undefined, { refetchInterval: 2000 });
  const [cfg, setCfg] = useState<Record<string, number>>({});
  const start = useMutation({ mutationFn: () => api<Status>("/api/simulator/start", { method: "POST", body: JSON.stringify(cfg) }), onSuccess: () => qc.invalidateQueries({ queryKey: ["sim"] }) });
  const stop = useMutation({ mutationFn: () => api<Status>("/api/simulator/stop", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["sim"] }) });
  const admin = can("control_simulator");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Data Simulator</h1>
      <Note>Generates synthetic bedside readings for currently monitored patients and raises alarms through the same ingestion path and demo threshold rules as real devices would. Duplicate and delayed deliveries are injected to exercise idempotent ingestion.</Note>
      <QueryBoundary q={q}>
        {(s) => (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="State" value={s.running ? <Badge className="border-good/40 bg-good/5 text-base text-good-text">● Running</Badge> : <Badge className="border-black/20 text-base text-ink-2">■ Stopped</Badge>} hint={s.started_at ? `since ${fmtTime(s.started_at)}` : undefined} />
              <Stat label="Ticks" value={s.ticks} />
              <Stat label="Readings ingested" value={s.measurements_ingested} />
              <Stat label="Duplicates ignored" value={s.duplicates_ignored} hint="idempotency key: device + type + time" />
              <Stat label="Alarms raised" value={s.alarms_created} tone="brand" />
            </div>
            <Card>
              <CardHeader title="Configuration" subtitle={admin ? "Applied on start" : "Only administrators can control the simulator"} right={
                admin && (s.running
                  ? <Button variant="danger" onClick={() => stop.mutate()} disabled={stop.isPending}><Pause size={14} /> Stop</Button>
                  : <Button variant="primary" onClick={() => start.mutate()} disabled={start.isPending}><Play size={14} /> Start simulator</Button>)
              } />
              <div className="grid gap-4 p-4 md:grid-cols-3">
                {FIELDS.map((f) => (
                  <label key={f.key} className="text-xs">
                    <span className="text-ink-2">{f.label}</span>
                    <input type="number" min={f.min} max={f.max} step={f.step} disabled={!admin || s.running}
                      defaultValue={s[f.key] as number} onChange={(e) => setCfg({ ...cfg, [f.key]: Number(e.target.value) })}
                      className="mt-1 h-8 w-full rounded-md border border-black/15 bg-white px-2 disabled:bg-black/[0.03]" />
                  </label>
                ))}
              </div>
              {(start.error || stop.error) && <p role="alert" className="px-4 pb-3 text-xs text-crit">{((start.error || stop.error) as Error).message}</p>}
              {s.last_error && <p className="px-4 pb-3 text-xs text-crit">Last tick error: {s.last_error}</p>}
            </Card>
          </>
        )}
      </QueryBoundary>
      <Card>
        <CardHeader title="Live event feed" subtitle={connected ? "Connected via Server-Sent Events" : "Stream disconnected — retrying"} />
        {events.length === 0 ? <p className="p-4 text-xs text-muted">No events yet. Start the simulator (admin) or acknowledge an alarm.</p> : (
          <ul className="max-h-80 divide-y divide-black/5 overflow-auto text-xs" aria-live="polite">
            {events.map((e, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-1.5">
                <span className="tabular text-muted">{new Date(e.received).toLocaleTimeString()}</span>
                {e.event === "alarm" ? (
                  <>
                    {e.severity && <SeverityBadge severity={e.severity} />}
                    <span className="font-medium">{e.alarm_type}</span>
                    <Link to={`/patients/${e.patient_id}`} className="text-brand-dark hover:underline">{e.patient_id}</Link>
                    <span className="text-muted">{e.care_unit}</span>
                  </>
                ) : (
                  <span>Alarm #{e.alarm_id} → {e.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
