import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtMinutes, fmtNum, fmtTime, MEAS_LABEL } from "../lib/format";
import type { Alarm, Severity } from "../lib/types";
import { Button, Empty, SeverityBadge, StatusBadge, cn } from "./ui";

const RANK: Record<Severity, number> = { critical: 3, warning: 2, advisory: 1 };

type SortKey = "priority" | "patient" | "age" | "alarm_type" | "severity" | "triggered_at" | "unack" | "nurse" | "attention";

export function AttentionPill({ a }: { a: Alarm["attention"] }) {
  if (!a) return <span className="text-muted">—</span>;
  return (
    <span className="tabular inline-flex items-center gap-1 rounded border border-black/15 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-ink" title={a.label}>
      {a.score}
      <span className="font-normal text-muted">/100</span>
    </span>
  );
}

export function AttentionFactors({ a }: { a: NonNullable<Alarm["attention"]> }) {
  return (
    <div className="text-xs">
      <div className="mb-1 font-semibold text-ink">{a.label}</div>
      <p className="mb-2 text-muted">Transparent operational points from alarm facts only. Not a clinical risk score; it does not predict deterioration.</p>
      <table className="w-full max-w-lg">
        <tbody>
          {a.factors.map((f) => (
            <tr key={f.factor} className="border-b border-black/5">
              <td className="py-1 pr-3 text-ink-2">{f.factor}</td>
              <td className="tabular py-1 pr-3 text-right">{String(f.value)}</td>
              <td className="tabular py-1 text-right font-medium">+{f.points}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1 font-semibold" colSpan={2}>Total (capped at 100)</td>
            <td className="tabular py-1 text-right font-semibold">{a.score}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function useAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Alarm>(`/api/alarms/${id}/acknowledge`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alarms"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["patient-alarms"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function AlarmTable({ alarms, compact = false }: { alarms: Alarm[]; compact?: boolean }) {
  const { can } = useAuth();
  const ack = useAcknowledge();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "priority", dir: 1 });
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo(() => {
    const val = (a: Alarm): number | string => {
      switch (sort.key) {
        case "patient": return a.synthetic_name ?? a.patient_id;
        case "age": return a.age ?? 0;
        case "alarm_type": return a.alarm_type;
        case "severity": return -RANK[a.severity];
        case "triggered_at": return -new Date(a.triggered_at).getTime();
        case "unack": return -(a.minutes_unacknowledged ?? -1);
        case "nurse": return a.assigned_nurse;
        case "attention": return -(a.attention?.score ?? -1);
        default: return 0;
      }
    };
    const copy = [...alarms];
    if (sort.key !== "priority") copy.sort((x, y) => (val(x) < val(y) ? -1 : val(x) > val(y) ? 1 : 0) * sort.dir);
    return copy;
  }, [alarms, sort]);

  if (!alarms.length) return <Empty>No alarms match the current filters.</Empty>;

  const H = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-2 py-2 font-medium", className)} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-0.5 hover:text-ink" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : 1 }))}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-xs">
        <thead>
          <tr className="border-b border-black/10 text-left text-ink-2">
            <th className="w-6" />
            <H k="patient">Patient</H>
            <H k="age">Age</H>
            {!compact && <th className="px-2 py-2 font-medium">Diagnosis</th>}
            <th className="px-2 py-2 font-medium">Current value</th>
            <H k="alarm_type">Alarm</H>
            <H k="severity">Severity</H>
            <H k="triggered_at">Alarm time</H>
            <H k="unack">Unack’d for</H>
            {!compact && <H k="nurse">Assigned nurse</H>}
            <th className="px-2 py-2 font-medium">Status</th>
            <H k="attention">Attention*</H>
            <th className="px-2 py-2 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <Fragment key={a.alarm_id}>
              <tr className={cn("border-b border-black/5 hover:bg-brand-soft/40", !a.acknowledged_at && a.severity === "critical" && "bg-crit/[0.04]")}>
                <td className="pl-1">
                  {a.attention && (
                    <button aria-label={`Show attention factors for alarm ${a.alarm_id}`} aria-expanded={open === a.alarm_id} onClick={() => setOpen(open === a.alarm_id ? null : a.alarm_id)} className="rounded p-0.5 text-muted hover:bg-black/5">
                      {open === a.alarm_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Link to={`/patients/${a.patient_id}`} className="font-medium text-brand-dark hover:underline">{a.synthetic_name ?? a.patient_id}</Link>
                  <div className="text-[11px] text-muted">{a.patient_id} · {a.care_unit}</div>
                </td>
                <td className="tabular px-2 py-2">{a.age ?? "—"}</td>
                {!compact && <td className="max-w-[180px] px-2 py-2 text-ink-2">{a.diagnoses?.join(", ") || "—"}</td>}
                <td className="tabular px-2 py-2">
                  {a.trigger_value !== null ? (
                    <span title="Value that triggered the alarm">
                      <b>{fmtNum(a.trigger_value, 0)}</b> {a.trigger_unit}
                    </span>
                  ) : (
                    <span className="text-muted">no signal</span>
                  )}
                  {a.current_measurement && (
                    <div className="text-[11px] text-muted" title={`Latest ${a.current_measurement.measurement_type} at ${fmtTime(a.current_measurement.observed_at)}`}>
                      latest {MEAS_LABEL[a.current_measurement.measurement_type]} {a.current_measurement.value} {a.current_measurement.unit}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 font-medium">{a.alarm_type}</td>
                <td className="px-2 py-2"><SeverityBadge severity={a.severity} /></td>
                <td className="tabular px-2 py-2">{fmtTime(a.triggered_at)}</td>
                <td className={cn("tabular px-2 py-2", (a.minutes_unacknowledged ?? 0) > 5 && "font-semibold text-crit")}>
                  {a.acknowledged_at ? "—" : fmtMinutes(a.minutes_unacknowledged)}
                </td>
                {!compact && <td className="px-2 py-2 text-ink-2">{a.assigned_nurse}</td>}
                <td className="px-2 py-2"><StatusBadge status={a.clinical_review_status} acknowledged={!!a.acknowledged_at} resolved={!!a.resolved_at} /></td>
                <td className="px-2 py-2"><AttentionPill a={a.attention} /></td>
                <td className="px-2 py-2 text-right">
                  {!a.acknowledged_at && can("acknowledge_alarm") ? (
                    <Button size="sm" variant="primary" disabled={ack.isPending && ack.variables === a.alarm_id} onClick={() => ack.mutate(a.alarm_id)} aria-label={`Acknowledge alarm ${a.alarm_id}`}>
                      <Check size={12} /> Acknowledge
                    </Button>
                  ) : (
                    <Link to={`/patients/${a.patient_id}`} className="text-[11px] text-brand-dark hover:underline">View patient</Link>
                  )}
                </td>
              </tr>
              {open === a.alarm_id && a.attention && (
                <tr className="bg-brand-soft/30">
                  <td />
                  <td colSpan={12} className="px-2 py-3"><AttentionFactors a={a.attention} /></td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {ack.error && <p role="alert" className="p-2 text-xs text-crit">{(ack.error as Error).message}</p>}
      <p className="px-2 pt-2 text-[11px] text-muted">
        Queue order: source alarm severity, then unacknowledged first, then oldest. *Operational Attention Indicator — Demo Only (expand a row to see its factors). Never a clinical urgency assessment.
      </p>
    </div>
  );
}
