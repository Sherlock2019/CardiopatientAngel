import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Play, RotateCcw } from "lucide-react";
import { useApi } from "../lib/api";
import { useMeta, presetRange } from "../lib/meta";
import { fmtMinutes, fmtNum } from "../lib/format";
import { AXIS, Legend, SERIES, TooltipBox } from "../components/charts";
import { Button, Card, CardHeader, ChartCard, DataTable, Note, QueryBoundary, Segmented, cn } from "../components/ui";

type F = { age_group: string[]; pathology: string[]; medication_class: string[]; treatment: string[]; unit: string[]; alarm_type: string[]; severity: string[]; hour: number[] };
const EMPTY: F = { age_group: [], pathology: [], medication_class: [], treatment: [], unit: [], alarm_type: [], severity: [], hour: [] };

interface CohortStats {
  patients: number; exposure_days: number; alarms: number; rate_per_100_patient_days: number | null; critical: number;
  critical_rate_per_100_patient_days: number | null; repeat_pct: number | null; median_ack_min: number | null; p90_ack_min: number | null;
  pct_patients_with_alarm: number | null; small_cohort: boolean; suppressed: boolean;
  trend: { week: string; alarms: number; rate_per_100_patient_days: number | null; exposure_days: number }[];
  by_alarm_type: { alarm_type: string; alarms: number }[];
  patient_list?: { patient_id: string; synthetic_name: string; age: number; care_unit: string; monitoring_status: string; exposure_days: number; alarms: number; critical: number; rate_per_100_patient_days: number | null }[];
}

function Chips({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={cn("rounded-full border px-2 py-0.5 text-[11px]", on ? "border-brand bg-brand text-white" : "border-black/15 bg-white text-ink-2 hover:bg-brand-soft")}>
              {on ? "✓ " : ""}{o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Builder({ f, setF }: { f: F; setF: (f: F) => void }) {
  const meta = useMeta();
  if (!meta.data) return null;
  const m = meta.data;
  const set = (k: keyof F) => (v: string[]) => setF({ ...f, [k]: v });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Chips label="Age group" options={m.age_groups} value={f.age_group} onChange={set("age_group")} />
      <Chips label="Pathology" options={m.pathologies} value={f.pathology} onChange={set("pathology")} />
      <Chips label="Medication class" options={m.medication_classes} value={f.medication_class} onChange={set("medication_class")} />
      <Chips label="Treatment" options={m.treatments} value={f.treatment} onChange={set("treatment")} />
      <Chips label="Care unit" options={m.care_units} value={f.unit} onChange={set("unit")} />
      <Chips label="Alarm type" options={m.alarm_types} value={f.alarm_type} onChange={set("alarm_type")} />
      <Chips label="Severity" options={m.severities} value={f.severity} onChange={set("severity")} />
      <Chips label="Hour of day" options={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"))} value={f.hour.map((h) => String(h).padStart(2, "0"))} onChange={(v) => setF({ ...f, hour: v.map(Number) })} />
    </div>
  );
}

const STATS: { key: keyof CohortStats; label: string; fmt: (v: any) => string }[] = [
  { key: "patients", label: "Patients", fmt: (v) => fmtNum(v, 0) },
  { key: "exposure_days", label: "Monitoring exposure (patient-days)", fmt: (v) => fmtNum(v, 0) },
  { key: "alarms", label: "Alarms", fmt: (v) => fmtNum(v, 0) },
  { key: "rate_per_100_patient_days", label: "Alarms /100 patient-days", fmt: (v) => fmtNum(v, 1) },
  { key: "critical", label: "Critical alarms", fmt: (v) => fmtNum(v, 0) },
  { key: "critical_rate_per_100_patient_days", label: "Critical /100 patient-days", fmt: (v) => fmtNum(v, 2) },
  { key: "repeat_pct", label: "Repeat alarms", fmt: (v) => (v === null ? "—" : `${fmtNum(v)}%`) },
  { key: "pct_patients_with_alarm", label: "Patients with ≥1 alarm", fmt: (v) => (v === null ? "—" : `${fmtNum(v)}%`) },
  { key: "median_ack_min", label: "Median acknowledgment", fmt: fmtMinutes },
  { key: "p90_ack_min", label: "90th pct acknowledgment", fmt: fmtMinutes },
];

const toQuery = (f: F, prefix = "") => Object.fromEntries(Object.entries(f).map(([k, v]) => [prefix + k, v]));

export default function CohortExplorer() {
  const [draft, setDraft] = useState<F>({ ...EMPTY, age_group: ["80-89", "90+"], pathology: ["Heart failure"] });
  const [refDraft, setRefDraft] = useState<F>(EMPTY);
  const [refMode, setRefMode] = useState<"all" | "custom">("all");
  const [days, setDays] = useState("90");
  const [applied, setApplied] = useState({ f: draft, ref: EMPTY, days: "90" });
  const q = useApi<{ cohort: CohortStats; reference: CohortStats; method_note: string; note: string }>(
    ["cohort"], "/api/analytics/cohorts", { ...toQuery(applied.f), ...toQuery(applied.ref, "ref_"), ...presetRange(Number(applied.days)) },
  );
  const run = () => setApplied({ f: draft, ref: refMode === "all" ? EMPTY : refDraft, days });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Cohort Explorer</h1>
        <p className="text-xs text-muted">Combine filters (OR within a group, AND across groups). Exposure counts only time when every selected diagnosis, medication and treatment was in effect.</p>
      </div>
      <Card>
        <CardHeader title="Define cohort" right={
          <>
            <Segmented label="Date range" value={days} onChange={setDays} options={[{ value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }]} />
            <Button size="sm" variant="ghost" onClick={() => setDraft(EMPTY)}><RotateCcw size={12} /> Clear</Button>
            <Button size="sm" variant="primary" onClick={run}><Play size={12} /> Run analysis</Button>
          </>
        } />
        <div className="space-y-4 p-4">
          <Builder f={draft} setF={setDraft} />
          <div className="border-t border-black/5 pt-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold">Reference cohort
              <Segmented label="Reference cohort" value={refMode} onChange={setRefMode} options={[{ value: "all", label: "All monitored patients" }, { value: "custom", label: "Custom" }]} />
            </div>
            {refMode === "custom" && <Builder f={refDraft} setF={setRefDraft} />}
          </div>
        </div>
      </Card>

      <QueryBoundary q={q}>
        {(d) => (
          <>
            {d.cohort.small_cohort && <Note tone="warn">Small cohort ({d.cohort.patients} patients). {d.cohort.suppressed ? "Rates are suppressed below 10 patients." : "Interpret rates with caution."}</Note>}
            <Card>
              <CardHeader title="Cohort vs. reference" subtitle={d.method_note} />
              <div className="overflow-x-auto p-4">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-black/10 text-left text-ink-2"><th className="py-1.5 font-medium">Measure</th><th className="py-1.5 text-right font-medium">Cohort</th><th className="py-1.5 text-right font-medium">Reference</th><th className="py-1.5 text-right font-medium">Ratio</th></tr></thead>
                  <tbody>
                    {STATS.map((s) => {
                      const a = d.cohort[s.key] as number | null, b = d.reference[s.key] as number | null;
                      const ratio = a !== null && b ? a / b : null;
                      return (
                        <tr key={s.key} className="border-b border-black/5">
                          <td className="py-1.5">{s.label}</td>
                          <td className="tabular py-1.5 text-right font-semibold">{s.fmt(a)}</td>
                          <td className="tabular py-1.5 text-right text-ink-2">{s.fmt(b)}</td>
                          <td className="tabular py-1.5 text-right">{ratio !== null && !["patients", "exposure_days", "alarms", "critical"].includes(s.key) ? `×${ratio.toFixed(2)}` : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
              <ChartCard
                title="Weekly alarm rate: cohort vs. reference"
                subtitle="Alarms per 100 patient-days in each week"
                controls={<Legend items={[{ label: "Cohort", color: SERIES[0] }, { label: "Reference", color: SERIES[1], dashed: true }]} />}
                chart={
                  <div className="h-60">
                    <ResponsiveContainer>
                      <LineChart data={d.cohort.trend.map((t, i) => ({ week: t.week, cohort: t.rate_per_100_patient_days, reference: d.reference.trend[i]?.rate_per_100_patient_days ?? null }))}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="week" {...AXIS} tickLine={false} minTickGap={30} />
                        <YAxis {...AXIS} width={36} tickLine={false} axisLine={false} />
                        <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TooltipBox title={`Week of ${label}`} rows={payload.map((p) => ({ label: String(p.name), value: fmtNum(p.value as number, 1), color: p.color }))} /> : null} />
                        <Line dataKey="cohort" name="Cohort" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                        <Line dataKey="reference" name="Reference" stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                }
                table={<DataTable rows={d.cohort.trend} columns={[{ key: "week", label: "Week" }, { key: "exposure_days", label: "Patient-days", align: "right" }, { key: "alarms", label: "Alarms", align: "right" }, { key: "rate_per_100_patient_days", label: "/100 pt-days", align: "right", fmt: (v) => fmtNum(v) }]} />}
              />
              <ChartCard title="Alarm types in cohort" chart={<DataTable rows={d.cohort.by_alarm_type} columns={[{ key: "alarm_type", label: "Alarm type" }, { key: "alarms", label: "Alarms", align: "right" }]} />} />
            </div>
            <Card>
              <CardHeader title="Contributing synthetic patients" subtitle="Top 200 by alarms within the cohort window — select a patient to drill down" />
              <div className="max-h-96 overflow-auto">
                <DataTable rows={d.cohort.patient_list ?? []} columns={[
                  { key: "synthetic_name", label: "Patient", fmt: (v, r) => <Link className="font-medium text-brand-dark hover:underline" to={`/patients/${r.patient_id}`}>{v} <span className="text-muted">{r.patient_id}</span></Link> },
                  { key: "age", label: "Age", align: "right" }, { key: "care_unit", label: "Unit" }, { key: "monitoring_status", label: "Status" },
                  { key: "exposure_days", label: "Cohort days", align: "right", fmt: (v) => fmtNum(v) },
                  { key: "alarms", label: "Alarms", align: "right" }, { key: "critical", label: "Critical", align: "right" },
                  { key: "rate_per_100_patient_days", label: "/100 pt-days", align: "right", fmt: (v) => fmtNum(v, 0) },
                ]} />
              </div>
            </Card>
            <Note>{d.note}</Note>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
