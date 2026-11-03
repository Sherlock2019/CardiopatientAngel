import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertOctagon, BellOff, BellRing, Clock, Repeat, Users } from "lucide-react";
import { useApi } from "../lib/api";
import { fmtMinutes, fmtTime } from "../lib/format";
import type { Alarm, Summary } from "../lib/types";
import { AlarmTable } from "../components/AlarmTable";
import { AXIS, SERIES, TooltipBox } from "../components/charts";
import OutcomeComparison from "../components/OutcomeComparison";
import { Card, CardHeader, QueryBoundary, Stat } from "../components/ui";

export default function CommandCenter() {
  const summary = useApi<Summary>(["summary"], "/api/dashboard/summary", undefined, { refetchInterval: 30_000 });
  const alarms = useApi<{ items: Alarm[] }>(["alarms", "queue"], "/api/alarms", { status: "active", limit: 15, sort: "priority" }, { refetchInterval: 30_000 });
  const s = summary.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Nurse Command Center</h1>
          <p className="text-xs text-muted">All cardiac-monitored patients · {s ? `as of ${fmtTime(s.as_of)}` : "loading…"}</p>
        </div>
      </div>

      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={<Users size={14} />} label="Monitored patients" value={s?.monitored_patients ?? "—"} hint={s && `${s.total_patients.toLocaleString()} in 90-day registry`} />
        <Stat icon={<BellRing size={14} />} label="Active alarms" value={s?.active_alarms ?? "—"} hint={s && `${s.alarms_24h} alarms in last 24 h`} tone="brand" />
        <Stat icon={<BellOff size={14} />} label="Unacknowledged" value={s?.unacknowledged_alarms ?? "—"} hint="awaiting a nurse" tone={s && s.unacknowledged_alarms > 0 ? "crit" : undefined} />
        <Stat icon={<AlertOctagon size={14} />} label="Critical (active)" value={s?.critical_active_alarms ?? "—"} hint="source severity" tone={s && s.critical_active_alarms > 0 ? "crit" : undefined} />
        <Stat icon={<Repeat size={14} />} label="Repeated-alarm patients" value={s?.patients_with_repeated_alarms_24h ?? "—"} hint="same alarm type re-fired, 24 h" />
        <Stat icon={<Clock size={14} />} label="Median ack time" value={fmtMinutes(s?.median_ack_minutes_24h)} hint="last 24 h" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Live alarm queue" subtitle="Unresolved alarms, by source severity → unacknowledged → oldest" right={<Link to="/alarms" className="text-xs font-medium text-brand-dark hover:underline">Open full queue →</Link>} />
          <QueryBoundary q={alarms}>{(d) => <AlarmTable alarms={d.items} compact />}</QueryBoundary>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Alarms per hour, last 24 h" />
            <div className="h-40 px-2 py-3">
              {s && (
                <ResponsiveContainer>
                  <BarChart data={s.hourly_24h} barCategoryGap={2}>
                    <XAxis dataKey="hour" tickFormatter={(v) => fmtTime(v, false)} {...AXIS} interval={5} tickLine={false} />
                    <YAxis {...AXIS} width={28} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} content={({ active, payload }) => active && payload?.length ? <TooltipBox title={fmtTime(payload[0].payload.hour)} rows={[{ label: "Alarms", value: payload[0].value as number, color: SERIES[0] }]} /> : null} />
                    <Bar dataKey="alarms" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Active alarms by unit" />
            <ul className="space-y-1.5 p-4 text-xs">
              {s && Object.entries(s.active_by_unit).map(([u, n]) => {
                const max = Math.max(1, ...Object.values(s.active_by_unit));
                return (
                  <li key={u} className="grid grid-cols-[1fr_auto] items-center gap-x-2">
                    <span className="text-ink-2">{u}</span>
                    <span className="tabular font-semibold">{n}</span>
                    <div className="col-span-2 h-1.5 rounded-sm bg-black/[0.04]"><div className="h-1.5 rounded-r-[4px]" style={{ width: `${(n / max) * 100}%`, background: SERIES[0] }} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <OutcomeComparison />
    </div>
  );
}
