import { Fragment, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi, type Params } from "../lib/api";
import { useMeta, type AnalyticsFilters } from "../lib/meta";
import { fmtNum } from "../lib/format";
import type { RateRow } from "../lib/types";
import { FilterBar, toParams } from "../components/FilterBar";
import { AXIS, SERIES, SeqLegend, TooltipBox, inkOn, seqColor } from "../components/charts";
import { ChartCard, DataTable, Note, QueryBoundary, Segmented, Badge } from "../components/ui";

type Resp<T> = { rows: T[]; note: string; overlap_note?: string; causal_note?: string };

const METRICS = {
  rate: { label: "Per 100 patient-days", key: "rate_per_100_patient_days" },
  count: { label: "Alarm count", key: "alarms" },
  pct: { label: "% patients with ≥1 alarm", key: "pct_patients_with_alarm" },
} as const;
type Metric = keyof typeof METRICS;

const rateCols = (first: { key: string; label: string }) => [
  first,
  { key: "patients", label: "Patients", align: "right" as const },
  { key: "exposure_days", label: "Patient-days", align: "right" as const, fmt: (v: number) => fmtNum(v, 0) },
  { key: "alarms", label: "Alarms", align: "right" as const },
  { key: "rate_per_100_patient_days", label: "/100 pt-days", align: "right" as const, fmt: (v: number) => fmtNum(v, 1) },
  { key: "critical_rate_per_100_patient_days", label: "Critical /100 pt-days", align: "right" as const, fmt: (v: number) => fmtNum(v, 2) },
  { key: "pct_patients_with_alarm", label: "% with alarm", align: "right" as const, fmt: (v: number) => fmtNum(v) },
  { key: "small_cohort", label: "Flag", fmt: (v: boolean, r: RateRow) => (r.suppressed ? "suppressed (n<10)" : v ? "small cohort" : "") },
];

function RateBars({ rows, cat, metric, horizontal }: { rows: RateRow[]; cat: string; metric: Metric; horizontal?: boolean }) {
  const k = METRICS[metric].key;
  const tip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as RateRow & Record<string, any>;
    return <TooltipBox title={r[cat]} rows={[
      { label: METRICS[metric].label, value: fmtNum(r[k]), color: SERIES[0] },
      { label: "Patients (cohort)", value: r.patients },
      { label: "Patient-days", value: fmtNum(r.exposure_days, 0) },
      { label: "Alarms", value: r.alarms },
      ...(r.small_cohort ? [{ label: "⚠", value: "small cohort" }] : []),
    ]} />;
  };
  return (
    <div className={horizontal ? "h-64" : "h-60"}>
      <ResponsiveContainer>
        {horizontal ? (
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...AXIS} tickLine={false} />
            <YAxis type="category" dataKey={cat} width={170} {...AXIS} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={tip} />
            <Bar dataKey={k} fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        ) : (
          <BarChart data={rows} barCategoryGap={10}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={cat} {...AXIS} tickLine={false} />
            <YAxis {...AXIS} width={40} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={tip} />
            <Bar dataKey={k} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function Heatmap({ p }: { p: Params }) {
  const [metric, setMetric] = useState<"rate" | "count">("rate");
  const q = useApi<{ cells: { dow: number; hour: number; day: string; alarms: number; patient_hours: number; rate_per_100_patient_hours: number | null }[]; timezone: string }>(["heatmap"], "/api/analytics/hourly-heatmap", p);
  const key = metric === "rate" ? "rate_per_100_patient_hours" : "alarms";
  const max = Math.max(0, ...(q.data?.cells.map((c) => (c[key] as number) ?? 0) ?? [0]));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <ChartCard
      title="4 · Alarm heatmap — hour of day × day of week"
      subtitle={q.data ? `Local time: ${q.data.timezone}. Rate = alarms per 100 monitored patient-hours in that slot.` : undefined}
      controls={<Segmented label="Heatmap metric" value={metric} onChange={setMetric} options={[{ value: "rate", label: "Rate" }, { value: "count", label: "Count" }]} />}
      chart={
        <QueryBoundary q={q}>
          {(d) => (
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-[2px] text-[10px]">
                <div />
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center text-muted">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</div>)}
                {days.map((day, di) => (
                  <Fragment key={day}>
                    <div className="flex items-center text-muted">{day}</div>
                    {d.cells.filter((c) => c.dow === di).map((c) => {
                      const v = c[key] as number | null;
                      const bg = seqColor(v, max);
                      return (
                        <div key={`${di}-${c.hour}`} className="group relative flex h-7 items-center justify-center rounded-[3px]" style={{ background: bg, color: inkOn(bg) }}
                          title={`${day} ${String(c.hour).padStart(2, "0")}:00 — ${c.alarms} alarms, ${c.patient_hours} patient-hours, ${fmtNum(c.rate_per_100_patient_hours, 2)} /100 pt-h`}>
                          <span className="sr-only">{`${day} ${c.hour}:00 ${fmtNum(v)}`}</span>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <div className="mt-3"><SeqLegend max={max} label={metric === "rate" ? "alarms /100 patient-hours" : "alarms"} /></div>
            </div>
          )}
        </QueryBoundary>
      }
      table={q.data && <DataTable rows={q.data.cells} columns={[{ key: "day", label: "Day" }, { key: "hour", label: "Hour", align: "right" }, { key: "alarms", label: "Alarms", align: "right" }, { key: "patient_hours", label: "Patient-hours", align: "right" }, { key: "rate_per_100_patient_hours", label: "/100 pt-h", align: "right", fmt: (v) => fmtNum(v, 2) }]} />}
    />
  );
}

function Matrix({ title, subtitle, rowsLabel, rows, cols, cell, footer }: { title: string; subtitle: string; rowsLabel: string; rows: string[]; cols: string[]; cell: (r: string, c: string) => { v: number | null; n?: number; small?: boolean; suppressed?: boolean; tip: string } | undefined; footer?: React.ReactNode }) {
  const values = rows.flatMap((r) => cols.map((c) => cell(r, c)?.v ?? 0));
  const max = Math.max(0, ...values);
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      chart={
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-[11px]">
            <thead>
              <tr><th className="text-left font-medium text-muted">{rowsLabel}</th>{cols.map((c) => <th key={c} className="px-1 font-medium text-ink-2">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th className="whitespace-nowrap pr-2 text-left font-medium text-ink-2">{r}</th>
                  {cols.map((c) => {
                    const x = cell(r, c);
                    if (!x) return <td key={c} className="rounded-[3px] bg-black/[0.03] text-center text-muted">—</td>;
                    const bg = x.suppressed ? "#f0efec" : seqColor(x.v, max);
                    return (
                      <td key={c} title={x.tip} className="h-9 rounded-[3px] text-center tabular" style={{ background: bg, color: inkOn(bg) }}>
                        {x.suppressed ? "n<10" : fmtNum(x.v)}
                        {x.n !== undefined && <div className="text-[9px] opacity-80">n={x.n}{x.small && !x.suppressed ? " ⚠" : ""}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2"><SeqLegend max={max} label="alarms /100 patient-days" /></div>
        </div>
      }
      footer={footer}
    />
  );
}

export default function RiskAnalytics() {
  const meta = useMeta();
  const [f, setF] = useState<AnalyticsFilters & { preset?: string }>({ preset: "90" });
  const p = toParams(f);
  const [ageMetric, setAgeMetric] = useState<Metric>("rate");
  const [pathMetric, setPathMetric] = useState<Metric>("rate");
  const [txMetric, setTxMetric] = useState<Metric>("rate");
  const [trendMetric, setTrendMetric] = useState("alarms");
  const [gran, setGran] = useState<"day" | "week">("day");

  const age = useApi<Resp<RateRow>>(["by-age"], "/api/analytics/by-age", p);
  const path = useApi<Resp<RateRow>>(["by-path"], "/api/analytics/by-pathology", p);
  const tx = useApi<Resp<RateRow>>(["by-tx"], "/api/analytics/by-treatment", p);
  const ap = useApi<{ cells: (RateRow & { age_group: string; key: string })[]; overlap_note: string }>(["age-path"], "/api/analytics/age-pathology", p);
  const med = useApi<Resp<RateRow> & { matrix: { cells: { key: string; alarm_type: string; alarms: number; rate_per_100_patient_days: number; share_pct: number; patients: number }[]; alarms_with_any_class_active: number; alarms_with_multiple_classes_active: number; total_alarms: number } }>(["by-med"], "/api/analytics/by-medication", p);
  const tr = useApi<{ rows: Record<string, number | string | null>[] }>(["trends"], "/api/analytics/trends", { ...p, granularity: gran });

  const top = useMemo(() => {
    const cands = [
      ...(age.data?.rows ?? []).map((r) => ({ name: `Age ${r.age_group}`, r })),
      ...(path.data?.rows ?? []).map((r) => ({ name: r.key!, r })),
      ...(tx.data?.rows ?? []).map((r) => ({ name: r.key!, r })),
      ...(med.data?.rows ?? []).map((r) => ({ name: r.key!, r })),
    ].filter((x) => !x.r.small_cohort && x.r.rate_per_100_patient_days !== null);
    return cands.sort((a, b) => (b.r.rate_per_100_patient_days ?? 0) - (a.r.rate_per_100_patient_days ?? 0)).slice(0, 5);
  }, [age.data, path.data, tx.data, med.data]);

  const metricToggle = (v: Metric, set: (m: Metric) => void, label: string) => (
    <Segmented label={label} value={v} onChange={set} options={(Object.keys(METRICS) as Metric[]).map((m) => ({ value: m, label: m === "rate" ? "Rate" : m === "count" ? "Count" : "% patients" }))} />
  );

  const TREND = { alarms: "Total alarms", critical: "Critical alarms", rate_per_100_patient_days: "Alarm rate /100 pt-days", median_ack_min: "Median ack delay (min)", repeats: "Repeated alarms" } as Record<string, string>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Population Risk Analytics</h1>
        <p className="text-xs text-muted">Operational alarm burden across cohorts. Exposure-adjusted: rates divide alarms by monitored patient-time.</p>
      </div>
      <FilterBar value={f} onChange={setF} />

      <ChartCard
        title="Highest observed alarm burden (cohorts ≥ 20 patients)"
        subtitle="Ranked by alarms per 100 monitored patient-days. Cohorts overlap."
        chart={
          <ol className="grid gap-2 sm:grid-cols-5">
            {top.map((t, i) => (
              <li key={t.name} className="rounded-lg border border-black/10 bg-white p-3">
                <div className="text-[11px] text-muted">#{i + 1}</div>
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="tabular text-lg font-semibold text-brand-dark">{fmtNum(t.r.rate_per_100_patient_days)}</div>
                <div className="text-[11px] text-muted">per 100 pt-days · n={t.r.patients}</div>
              </li>
            ))}
          </ol>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="1 · Alarms by age group" subtitle={METRICS[ageMetric].label} controls={metricToggle(ageMetric, setAgeMetric, "Age metric")}
          chart={<QueryBoundary q={age}>{(d) => <RateBars rows={d.rows} cat="age_group" metric={ageMetric} />}</QueryBoundary>}
          table={age.data && <DataTable rows={age.data.rows} columns={rateCols({ key: "age_group", label: "Age group" })} />} />
        <ChartCard title="2 · Alarms by pathology" subtitle={METRICS[pathMetric].label} controls={metricToggle(pathMetric, setPathMetric, "Pathology metric")}
          chart={<QueryBoundary q={path}>{(d) => <RateBars rows={d.rows} cat="key" metric={pathMetric} horizontal />}</QueryBoundary>}
          table={path.data && <DataTable rows={path.data.rows} columns={rateCols({ key: "key", label: "Pathology" })} />}
          footer={<Note>{path.data?.overlap_note ?? "Diagnosis cohorts overlap."} Alarms are attributed only to diagnoses recorded before the alarm.</Note>} />
        <ChartCard title="3 · Alarms by treatment type" subtitle={METRICS[txMetric].label} controls={metricToggle(txMetric, setTxMetric, "Treatment metric")}
          chart={<QueryBoundary q={tx}>{(d) => <RateBars rows={d.rows} cat="key" metric={txMetric} horizontal />}</QueryBoundary>}
          table={tx.data && <DataTable rows={tx.data.rows} columns={rateCols({ key: "key", label: "Treatment" })} />}
          footer={<Note tone="warn">Associations between treatments and alarms do not establish treatment effects or causation. Patients on a treatment differ in many ways from those who are not.</Note>} />
        <Heatmap p={p} />
      </div>

      {meta.data && ap.data && (
        <Matrix
          title="5 · Age × pathology — alarms per 100 monitored patient-days"
          subtitle="Cells show rate and cohort size. ⚠ = fewer than 20 patients; n<10 suppressed."
          rowsLabel="Age group" rows={meta.data.age_groups} cols={meta.data.pathologies}
          cell={(r, c) => {
            const x = ap.data!.cells.find((y) => y.age_group === r && y.key === c);
            return x && { v: x.rate_per_100_patient_days, n: x.patients, small: x.small_cohort, suppressed: x.suppressed, tip: `${r} · ${c}: ${x.alarms} alarms over ${fmtNum(x.exposure_days, 0)} patient-days (${x.patients} patients)` };
          }}
          footer={<Note>{ap.data.overlap_note}</Note>}
        />
      )}

      {meta.data && med.data && (
        <Matrix
          title="6 · Medication class × alarm type — alarms per 100 patient-days on that class"
          subtitle={`Medication exposure is evaluated at alarm time. ${med.data.matrix.alarms_with_multiple_classes_active.toLocaleString()} of ${med.data.matrix.alarms_with_any_class_active.toLocaleString()} attributed alarms occurred while ≥2 classes were active, so they count in several rows.`}
          rowsLabel="Medication class" rows={meta.data.medication_classes} cols={meta.data.alarm_types}
          cell={(r, c) => {
            const x = med.data!.matrix.cells.find((y) => y.key === r && y.alarm_type === c);
            return x && { v: x.rate_per_100_patient_days, tip: `${r} · ${c}: ${x.alarms} alarms (${fmtNum(x.share_pct)}% of this class's alarms)` };
          }}
          footer={<Note tone="warn">Observed patterns only. This does not infer that a medication causes alarms and is not a medication-safety signal.</Note>}
        />
      )}

      <ChartCard
        title="7 · Trends over time"
        subtitle={TREND[trendMetric]}
        controls={
          <>
            <Segmented label="Granularity" value={gran} onChange={setGran} options={[{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }]} />
            <Segmented label="Trend metric" value={trendMetric} onChange={setTrendMetric} options={Object.entries(TREND).map(([value, label]) => ({ value, label: label.split(" (")[0].replace("Alarm rate /100 pt-days", "Rate") }))} />
          </>
        }
        chart={
          <QueryBoundary q={tr}>
            {(d) => (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={d.rows}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="period" {...AXIS} tickLine={false} minTickGap={30} />
                    <YAxis {...AXIS} width={40} tickLine={false} axisLine={false} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <TooltipBox title={`${gran === "week" ? "Week of " : ""}${label}`} rows={[{ label: TREND[trendMetric], value: fmtNum(payload[0].value as number, 2), color: SERIES[0] }, { label: "Patient-days", value: fmtNum(payload[0].payload.patient_days as number, 0) }]} /> : null} />
                    <Line dataKey={trendMetric} stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryBoundary>
        }
        table={tr.data && <DataTable rows={tr.data.rows} columns={[{ key: "period", label: "Period" }, { key: "patient_days", label: "Patient-days", align: "right", fmt: (v) => fmtNum(v, 0) }, { key: "alarms", label: "Alarms", align: "right" }, { key: "critical", label: "Critical", align: "right" }, { key: "rate_per_100_patient_days", label: "/100 pt-days", align: "right", fmt: (v) => fmtNum(v) }, { key: "median_ack_min", label: "Median ack (min)", align: "right", fmt: (v) => fmtNum(v, 2) }, { key: "repeats", label: "Repeats", align: "right" }]} />}
      />
      <p className="text-[11px] text-muted"><Badge className="border-black/15">Synthetic</Badge> All findings come from synthetic demonstration data with intentionally injected patterns (Settings → Data notes). They are not clinically validated.</p>
    </div>
  );
}
