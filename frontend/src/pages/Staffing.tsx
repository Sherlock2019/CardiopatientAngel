import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lightbulb } from "lucide-react";
import { useApi } from "../lib/api";
import type { AnalyticsFilters } from "../lib/meta";
import { fmtMinutes, fmtNum } from "../lib/format";
import { FilterBar, toParams } from "../components/FilterBar";
import { AXIS, SERIES, TooltipBox } from "../components/charts";
import { Card, CardHeader, ChartCard, DataTable, Note, QueryBoundary, SeverityBadge } from "../components/ui";

interface Staff {
  timezone: string;
  shifts: { shift: string; hours: string; alarms: number; critical: number; patient_hours: number; rate_per_100_patient_hours: number; median_ack_min: number; mean_ack_min: number; p90_ack_min: number; repeats: number }[];
  hourly: { hour: number; alarms: number; median_ack_min: number | null }[];
  units: { unit: string; alarms: number; exposure_days: number; rate_per_100_patient_days: number | null; median_ack_min: number | null; repeat_pct: number | null; peak_start_hour: number; peak_alarms: number; hourly: number[] }[];
  backlog: { unit: string; total: number; by_severity: Record<"critical" | "warning" | "advisory", number>; oldest_minutes: number | null }[];
  insights: string[];
  disclaimer: string;
}

function Spark({ values, peak }: { values: number[]; peak: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-6 items-end gap-px" aria-hidden>
      {values.map((v, h) => {
        const inPeak = [0, 1, 2].some((k) => (peak + k) % 24 === h);
        return <span key={h} className="w-1.5 rounded-t-[2px]" style={{ height: `${(v / max) * 100}%`, background: inPeak ? SERIES[1] : SERIES[0] }} />;
      })}
    </div>
  );
}

export default function Staffing() {
  const [f, setF] = useState<AnalyticsFilters & { preset?: string }>({ preset: "90" });
  const q = useApi<Staff>(["staffing"], "/api/analytics/staffing", toParams(f));
  const [hourMetric] = useState("alarms");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Nurse Staffing Insights</h1>
        <p className="text-xs text-muted">Descriptive alarm workload by shift, hour and unit — to support planning conversations.</p>
      </div>
      <FilterBar value={f} onChange={setF} />
      <QueryBoundary q={q}>
        {(d) => (
          <>
            <Card>
              <CardHeader title="Observed patterns" subtitle={`Hours in ${d.timezone}`} />
              <ul className="space-y-1.5 p-4 text-sm">
                {d.insights.map((s) => <li key={s} className="flex gap-2"><Lightbulb size={14} className="mt-1 shrink-0 text-brand" aria-hidden />{s}</li>)}
              </ul>
              <div className="px-4 pb-4"><Note tone="warn">{d.disclaimer}</Note></div>
            </Card>
            <div className="grid gap-3 md:grid-cols-3">
              {d.shifts.map((s) => (
                <Card key={s.shift} className="p-4">
                  <div className="text-xs text-muted">{s.shift} shift · {s.hours}</div>
                  <div className="tabular mt-1 text-2xl font-semibold">{s.alarms.toLocaleString()} <span className="text-xs font-normal text-muted">alarms</span></div>
                  <dl className="tabular mt-2 grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-ink-2">Rate /100 pt-hours</dt><dd className="text-right font-medium">{fmtNum(s.rate_per_100_patient_hours, 2)}</dd>
                    <dt className="text-ink-2">Critical</dt><dd className="text-right font-medium">{s.critical}</dd>
                    <dt className="text-ink-2">Median ack</dt><dd className="text-right font-medium">{fmtMinutes(s.median_ack_min)}</dd>
                    <dt className="text-ink-2">90th pct ack</dt><dd className="text-right font-medium">{fmtMinutes(s.p90_ack_min)}</dd>
                    <dt className="text-ink-2">Repeat alarms</dt><dd className="text-right font-medium">{s.repeats}</dd>
                  </dl>
                </Card>
              ))}
            </div>
            <ChartCard
              title="Alarm volume by hour of day"
              subtitle={`Total alarms in each local hour (${d.timezone})`}
              chart={
                <div className="h-56">
                  <ResponsiveContainer>
                    <BarChart data={d.hourly} barCategoryGap={2}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="hour" tickFormatter={(h) => `${String(h).padStart(2, "0")}:00`} {...AXIS} tickLine={false} interval={2} />
                      <YAxis {...AXIS} width={40} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(42,120,214,0.06)" }} content={({ active, payload }) => active && payload?.length ? <TooltipBox title={`${String(payload[0].payload.hour).padStart(2, "0")}:00–${String((payload[0].payload.hour + 1) % 24).padStart(2, "0")}:00`} rows={[{ label: "Alarms", value: payload[0].payload.alarms, color: SERIES[0] }, { label: "Median ack", value: fmtMinutes(payload[0].payload.median_ack_min) }]} /> : null} />
                      <Bar dataKey={hourMetric} fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              }
              table={<DataTable rows={d.hourly} columns={[{ key: "hour", label: "Hour", align: "right" }, { key: "alarms", label: "Alarms", align: "right" }, { key: "median_ack_min", label: "Median ack (min)", align: "right", fmt: (v) => fmtNum(v, 2) }]} />}
            />
            <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
              <Card>
                <CardHeader title="Alarm distribution by unit" subtitle="Sparkline = alarms by hour 00→23; orange = 3-hour peak window" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead><tr className="border-b border-black/10 text-left text-ink-2">{["Unit", "Alarms", "/100 pt-days", "Median ack", "Repeat %", "Peak window", "By hour"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      {d.units.map((u) => (
                        <tr key={u.unit} className="border-b border-black/5">
                          <td className="px-3 py-2 font-medium">{u.unit}</td>
                          <td className="tabular px-3 py-2">{u.alarms.toLocaleString()}</td>
                          <td className="tabular px-3 py-2">{fmtNum(u.rate_per_100_patient_days)}</td>
                          <td className="tabular px-3 py-2">{fmtMinutes(u.median_ack_min)}</td>
                          <td className="tabular px-3 py-2">{fmtNum(u.repeat_pct)}%</td>
                          <td className="tabular px-3 py-2">{String(u.peak_start_hour).padStart(2, "0")}:00–{String((u.peak_start_hour + 3) % 24).padStart(2, "0")}:00</td>
                          <td className="px-3 py-2"><Spark values={u.hourly} peak={u.peak_start_hour} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card>
                <CardHeader title="Unacknowledged backlog (now)" subtitle="Live, not limited to the date range" />
                <table className="w-full text-xs">
                  <tbody>
                    {d.backlog.map((b) => (
                      <tr key={b.unit} className="border-b border-black/5">
                        <td className="px-3 py-2 font-medium">{b.unit}</td>
                        <td className="tabular px-2 py-2 text-lg font-semibold">{b.total}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {(["critical", "warning", "advisory"] as const).filter((s) => b.by_severity[s]).map((s) => (
                              <span key={s} className="inline-flex items-center gap-1"><SeverityBadge severity={s} /><span className="tabular">×{b.by_severity[s]}</span></span>
                            ))}
                          </div>
                        </td>
                        <td className="tabular px-3 py-2 text-right text-ink-2">{b.oldest_minutes !== null ? `oldest ${fmtMinutes(b.oldest_minutes)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
