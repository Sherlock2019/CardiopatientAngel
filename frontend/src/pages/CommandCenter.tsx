import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { DoctorLens, PatientLens } from "../components/Lenses";
import { AlertOctagon, BatteryLow, BellOff, BellRing, Clock, Cpu, LayoutGrid, RefreshCw, Repeat, Star, Users, WifiOff } from "lucide-react";
import { useApi } from "../lib/api";
import { fmtMinutes, fmtTime } from "../lib/format";
import type { Alarm, Summary } from "../lib/types";
import type { DeviceRow, Fleet } from "./Devices";
import { AXIS, SERIES, TooltipBox } from "../components/charts";
import { BeatingHeart, DoctorAvatar, NurseAvatar, PatientAvatar } from "../components/Illustrations";
import { DeviceChip, MonitorTile, Oscilloscope } from "../components/Monitor";
import { AlarmTable } from "../components/AlarmTable";
import HierarchyPanel, { type Hierarchy } from "../components/Hierarchy";
import OutcomeComparison from "../components/OutcomeComparison";
import PatientCalendar from "../components/PatientCalendar";
import { Card, CardHeader, QueryBoundary, Segmented } from "../components/ui";

function CareTeam({ who, value, label }: { who: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
      {who}
      <div>
        <div className="tabular text-xl font-bold leading-none">{value}</div>
        <div className="mt-0.5 text-[11px] text-white/60">{label}</div>
      </div>
    </div>
  );
}

/* Grafana-like top bar: breadcrumb, time range, auto-refresh, manual refresh */
function Toolbar({ asOf, h, title }: { asOf?: string; h?: Hierarchy; title: string }) {
  const qc = useQueryClient();
  const crumbs = [h?.hospital ?? "Hospital", "Services", h?.service ?? "Cardiology"];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2c3235] pb-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <LayoutGrid size={16} className="text-[#8e8e96]" aria-hidden />
        {crumbs.map((c) => <span key={c} className="flex items-center gap-2"><span className="text-[#8e8e96]">{c}</span><span className="text-[#464c54]">/</span></span>)}
        <h1 className="font-medium text-[#d8d9da]">{title}</h1>
        {h && <span className="ml-2 flex items-center gap-1.5 rounded-sm bg-[#1f2c44] px-2 py-0.5 text-xs text-[#6e9fff]"><DoctorAvatar size={18} /> On call: {h.on_call.doctor} · {h.on_call.shift}</span>}
        <Star size={14} className="fill-[#f2cc0c] text-[#f2cc0c]" aria-hidden />
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="flex items-center gap-1.5 rounded-sm border border-[#2c3235] bg-[#181b1f] px-2.5 py-1.5 text-[#ccccdc]">
          <Clock size={13} aria-hidden /> Last 24 hours {asOf && <span className="text-[#8e8e96]">· {fmtTime(asOf)}</span>}
        </span>
        <button onClick={() => qc.invalidateQueries()} className="flex items-center gap-1.5 rounded-sm border border-[#2c3235] bg-[#181b1f] px-2.5 py-1.5 text-[#ccccdc] hover:bg-[#22252b]" aria-label="Refresh all panels">
          <RefreshCw size={13} aria-hidden /> 30s
        </button>
      </div>
    </div>
  );
}

/* Grafana stat panel: small title, big number coloured by threshold */
function GStat({ title, value, hint, color = "#73bf69", icon }: { title: string; value: React.ReactNode; hint?: React.ReactNode; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-[#2c3235] bg-[#181b1f] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[12px] text-[#ccccdc]">{icon}{title}</div>
      <div className="tabular mt-1 text-[32px] font-medium leading-none" style={{ color }}>{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-[#8e8e96]">{hint}</div>}
    </div>
  );
}
const G = { green: "#73bf69", orange: "#ff9830", red: "#f2495c", blue: "#5794f2", text: "#d8d9da" };

function Hero({ s, alarms }: { s?: Summary; alarms?: Alarm[] }) {
  const nurses = new Set((alarms ?? []).map((a) => a.assigned_nurse)).size;
  const crit = s?.critical_active_alarms ?? 0;
  return (
    <section aria-label="Ward overview" className="relative overflow-hidden rounded-[4px] border border-[#2c3235] bg-[#181b1f] p-4 text-white">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-3">
          <BeatingHeart size={56} bpm={crit > 0 ? 110 : 72} />
          <div>
            <div className="text-sm font-medium text-[#ccccdc]">Cardiac ward · live</div>
            <p className="text-xs text-white/60">All cardiac-monitored patients · {s ? `as of ${fmtTime(s.as_of)}` : "loading…"}</p>
            {crit > 0 && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#ff8a8a]"><AlertOctagon size={13} className="danger-pulse" aria-hidden /> {crit} critical alarm{crit > 1 ? "s" : ""} active</p>}
          </div>
        </div>
        <div className="min-w-[220px] flex-1">
          <Oscilloscope kind="ecg" height={56} speed={5} label="Decorative ECG trace" />
        </div>
        <div className="flex flex-wrap gap-2">
          <CareTeam who={<PatientAvatar size={40} seed="ward" />} value={s?.monitored_patients ?? "—"} label="patients monitored" />
          <CareTeam who={<NurseAvatar size={40} />} value={nurses || "—"} label="nurses on the alarm queue" />
          <CareTeam who={<DoctorAvatar size={40} />} value={crit} label="critical alarms for doctor review" />
        </div>
      </div>
    </section>
  );
}

function DeviceHealth({ fleet }: { fleet: Fleet }) {
  const failing = fleet.items.filter((d) => d.health === "offline" || d.health === "low_battery");
  return (
    <Card>
      <CardHeader title="IoT device health" subtitle={`${fleet.total} devices on monitored patients`} right={<Link to="/devices" className="text-xs font-medium text-brand-dark hover:underline">Fleet →</Link>} />
      <div className="grid grid-cols-3 gap-2 px-4 pt-3 text-center">
        {([["online", "Online", Cpu, "text-good-text"], ["low_battery", "Low battery", BatteryLow, "text-[#a86b00]"], ["offline", "Offline", WifiOff, "text-crit"]] as const).map(([k, label, Icon, cls]) => (
          <div key={k} className="rounded-lg bg-black/[0.03] py-2">
            <Icon size={15} className={`mx-auto ${cls} ${k === "offline" && fleet.summary.offline > 0 ? "danger-pulse" : ""}`} aria-hidden />
            <div className={`tabular text-lg font-bold ${cls}`}>{fleet.summary[k]}</div>
            <div className="text-[10.5px] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="p-4 pt-3">
        <div className="mb-1.5 text-[11px] font-semibold text-ink-2">Failing devices {failing.length > 0 && `(${failing.length})`}</div>
        {failing.length === 0 ? (
          <p className="text-xs text-good-text">All devices online and charged.</p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-auto text-xs">
            {failing.map((d) => (
              <li key={d.device_id} className="flex items-center justify-between gap-2">
                <Link to={`/patients/${d.patient_id}`} className="min-w-0 truncate hover:underline">{d.synthetic_name}</Link>
                <DeviceChip dv={d} dark={false} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function CommandCenter() {
  const summary = useApi<Summary>(["summary"], "/api/dashboard/summary", undefined, { refetchInterval: 30_000 });
  const alarms = useApi<{ items: Alarm[] }>(["alarms", "queue"], "/api/alarms", { status: "active", limit: 15, sort: "priority" }, { refetchInterval: 30_000 });
  const fleet = useApi<Fleet>(["devices"], "/api/devices", undefined, { refetchInterval: 15_000 });
  const { user } = useAuth();
  const [lens, setLens] = useState<"nurse" | "doctor" | "patient">(user?.role === "doctor" ? "doctor" : "nurse");
  const hier = useApi<Hierarchy>(["hierarchy"], "/api/dashboard/hierarchy", undefined, { refetchInterval: 60_000 });
  const s = summary.data;
  const byPatient = new Map<string, DeviceRow[]>();
  for (const dv of fleet.data?.items ?? []) byPatient.set(dv.patient_id, [...(byPatient.get(dv.patient_id) ?? []), dv]);

  return (
    <div className="grafana -m-4 min-h-full space-y-3 p-3 md:-m-6 md:p-4">
      <Toolbar asOf={s?.as_of} h={hier.data} title={{ nurse: "Nurse Command Center", doctor: "Doctor Command Center", patient: "Patients Command Center" }[lens]} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#8e8e96]">Lens</span>
        <Segmented label="Dashboard lens" value={lens} onChange={setLens}
          options={[{ value: "nurse", label: "Nurse view" }, { value: "doctor", label: "Doctor view" }, { value: "patient", label: "Patients view" }]} />
      </div>
      <Hero s={s} alarms={alarms.data?.items} />

      <section aria-label="Key indicators" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <GStat icon={<Users size={13} />} title="Monitored patients" value={s?.monitored_patients ?? "—"} color={G.blue} hint={s && `${s.total_patients.toLocaleString()} in 90-day registry`} />
        <GStat icon={<BellRing size={13} />} title="Active alarms" value={s?.active_alarms ?? "—"} color={G.text} hint={s && `${s.alarms_24h} alarms in last 24 h`} />
        <GStat icon={<BellOff size={13} />} title="Unacknowledged" value={s?.unacknowledged_alarms ?? "—"} hint="awaiting a nurse" color={s && s.unacknowledged_alarms > 0 ? G.orange : G.green} />
        <GStat icon={<AlertOctagon size={13} />} title="Critical (active)" value={s?.critical_active_alarms ?? "—"} hint="source severity" color={s && s.critical_active_alarms > 0 ? G.red : G.green} />
        <GStat icon={<Repeat size={13} />} title="Repeated-alarm patients" value={s?.patients_with_repeated_alarms_24h ?? "—"} hint="same type re-fired, 24 h" color={G.text} />
        <GStat icon={<Clock size={13} />} title="Median ack time" value={fmtMinutes(s?.median_ack_minutes_24h)} hint="last 24 h" color={G.text} />
        <GStat icon={<WifiOff size={13} />} title="Failing IoT devices" value={fleet.data ? fleet.data.summary.offline + fleet.data.summary.low_battery : "—"} hint={fleet.data && `${fleet.data.summary.offline} offline · ${fleet.data.summary.low_battery} low battery`} color={fleet.data && fleet.data.summary.offline > 0 ? G.red : fleet.data && fleet.data.summary.low_battery > 0 ? G.orange : G.green} />
      </section>

      {lens === "doctor" && <DoctorLens h={hier.data} alarms={alarms.data?.items} me={user?.display_name} />}
      {lens === "patient" && <PatientLens />}
      {lens === "nurse" && (<>
      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="Priority monitors"
            subtitle="Unresolved alarms by source severity → unacknowledged → oldest, with each patient's IoT devices. Traces are illustrative, shaped by the alarm type."
            right={<Link to="/alarms" className="text-xs font-medium text-brand-dark hover:underline">Open full queue →</Link>}
          />
          <QueryBoundary q={alarms}>
            {(d) => (
              <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                {d.items.slice(0, 9).map((a) => <MonitorTile key={a.alarm_id} a={a} devices={byPatient.get(a.patient_id)} />)}
              </div>
            )}
          </QueryBoundary>
          <div className="border-t border-black/10">
            <CardHeader title="Live alarm queue" subtitle="Acknowledge, review and drill down" />
            <QueryBoundary q={alarms}>{(d) => <AlarmTable alarms={d.items} compact />}</QueryBoundary>
          </div>
        </Card>
        <div className="space-y-3">
          <QueryBoundary q={fleet}>{(f) => <DeviceHealth fleet={f} />}</QueryBoundary>
          <Card>
            <CardHeader title="Alarms per hour, last 24 h" />
            <div className="h-40 px-2 py-3">
              {s && (
                <ResponsiveContainer>
                  <BarChart data={s.hourly_24h} barCategoryGap={2}>
                    <XAxis dataKey="hour" tickFormatter={(v) => fmtTime(v, false)} {...AXIS} interval={5} tickLine={false} />
                    <YAxis {...AXIS} width={28} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(42,120,214,0.08)" }} content={({ active, payload }) => active && payload?.length ? <TooltipBox title={fmtTime(payload[0].payload.hour)} rows={[{ label: "Alarms", value: payload[0].value as number, color: SERIES[0] }]} /> : null} />
                    <Bar dataKey="alarms" fill={G.green} radius={[2, 2, 0, 0]} />
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

      <QueryBoundary q={hier}>{(h) => <HierarchyPanel h={h} />}</QueryBoundary>

      <PatientCalendar />

      <OutcomeComparison />
      </>)}
    </div>
  );
}
