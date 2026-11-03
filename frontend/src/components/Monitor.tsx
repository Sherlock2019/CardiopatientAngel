import { Link } from "react-router-dom";
import { AlertTriangle, BatteryLow, Cpu, Siren, WifiOff } from "lucide-react";
import type { Alarm } from "../lib/types";
import type { DeviceRow } from "../pages/Devices";
import { cn } from "./ui";
import { NurseAvatar, PatientAvatar } from "./Illustrations";

/* Illustrative bedside-monitor traces. The shape follows the alarm type; it is NOT the patient's recorded waveform. */

type Kind = "ecg" | "fast" | "slow" | "irregular" | "pleth" | "arterial" | "flat";

function kindFor(alarmType: string): Kind {
  if (alarmType === "HR high") return "fast";
  if (alarmType === "HR low") return "slow";
  if (alarmType === "Irregular rhythm") return "irregular";
  if (alarmType === "SpO2 low") return "pleth";
  if (alarmType.startsWith("BP")) return "arterial";
  if (alarmType === "Signal loss" || alarmType === "Lead off") return "flat";
  return "ecg";
}

// one PQRST complex starting at x, baseline y, width w
function beat(x: number, y: number, w: number, withP = true) {
  const u = w / 20;
  return [
    withP ? `L${x + u * 2} ${y} Q${x + u * 3} ${y - 5} ${x + u * 4} ${y}` : `L${x + u * 4} ${y}`,
    `L${x + u * 6} ${y} L${x + u * 6.6} ${y + 4} L${x + u * 7.4} ${y - 30} L${x + u * 8.2} ${y + 9} L${x + u * 9} ${y}`,
    `L${x + u * 11} ${y} Q${x + u * 12.8} ${y - 9} ${x + u * 14.6} ${y}`,
    `L${x + w} ${y}`,
  ].join(" ");
}

// a path exactly `width` wide that tiles seamlessly, so two copies can scroll forever
export function tracePath(kind: Kind, width: number, y = 34) {
  let d = `M0 ${y}`;
  if (kind === "flat") {
    for (let x = 0; x < width; x += 6) d += ` L${x + 3} ${y + (x % 18 === 0 ? 1.5 : -1)} L${x + 6} ${y}`;
    return d;
  }
  if (kind === "pleth" || kind === "arterial") {
    const w = kind === "pleth" ? 50 : 40;
    const amp = kind === "pleth" ? 14 : 22;
    for (let x = 0; x < width; x += w) {
      d += ` C${x + w * 0.15} ${y} ${x + w * 0.2} ${y - amp} ${x + w * 0.32} ${y - amp}`;
      d += ` C${x + w * 0.45} ${y - amp} ${x + w * 0.5} ${y - amp * 0.35} ${x + w * 0.58} ${y - amp * 0.45}`;
      d += ` C${x + w * 0.7} ${y - amp * 0.5} ${x + w * 0.85} ${y} ${x + w} ${y}`;
    }
    return d;
  }
  const widths = kind === "fast" ? [25] : kind === "slow" ? [100] : kind === "irregular" ? [34, 58, 26, 46, 36] : [50];
  let x = 0, i = 0;
  while (x < width) {
    const w = Math.min(widths[i++ % widths.length], width - x);
    d += " " + beat(x, y, w, kind !== "irregular");
    x += w;
  }
  return d;
}

export function Oscilloscope({ kind, color = "#3ddc84", height = 64, speed = 4, label }: { kind: Kind; color?: string; height?: number; speed?: number; label?: string }) {
  const W = 200;
  const d = tracePath(kind, W, height / 2 + 6);
  return (
    <div className="scope relative overflow-hidden rounded-md" style={{ height }} role="img" aria-label={label ?? `Illustrative ${kind} trace`}>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${W} ${height}`} aria-hidden>
        <g className="scope-scroll" style={{ animationDuration: `${speed}s` }}>
          {[0, W].map((off) => (
            <path key={off} d={d} transform={`translate(${off} 0)`} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}

const SEV = {
  critical: { color: "#ff5a5a", ring: "ring-crit", label: "CRITICAL" },
  warning: { color: "#fab219", ring: "ring-warn", label: "WARNING" },
  advisory: { color: "#3ddc84", ring: "ring-white/10", label: "ADVISORY" },
} as const;

function AlarmIcon({ type, severity }: { type: string; severity: Alarm["severity"] }) {
  const cls = cn("shrink-0", severity === "critical" && "danger-pulse");
  if (type === "Signal loss" || type === "Lead off") return <WifiOff size={18} className={cls} aria-hidden />;
  if (type === "Low battery") return <BatteryLow size={18} className={cls} aria-hidden />;
  if (severity === "critical") return <Siren size={18} className={cls} aria-hidden />;
  return <AlertTriangle size={18} className={cls} aria-hidden />;
}

function vital(a: Alarm) {
  const m = a.current_measurement;
  if (!m) return null;
  const name = m.measurement_type === "heart_rate" ? "HR" : m.measurement_type === "spo2" ? "SpO₂" : m.measurement_type.replace(/_/g, " ").toUpperCase();
  return { name, value: Math.round(m.value), unit: m.unit };
}

const HEALTH = {
  online: { color: "#3ddc84", label: "online" },
  low_battery: { color: "#fab219", label: "low battery" },
  offline: { color: "#ff5a5a", label: "offline" },
  returned: { color: "#8a94a6", label: "returned" },
} as const;

export function DeviceChip({ dv, dark = true }: { dv: DeviceRow; dark?: boolean }) {
  const h = HEALTH[dv.health];
  const Icon = dv.health === "offline" ? WifiOff : dv.health === "low_battery" ? BatteryLow : Cpu;
  return (
    <span
      title={`${dv.device_id} · ${dv.model} · fw ${dv.firmware_version} · ${dv.connectivity}${dv.battery_pct != null ? ` · battery ${dv.battery_pct}%` : ""}${dv.minutes_since_sync != null ? ` · last sync ${Math.round(dv.minutes_since_sync)} min ago` : ""}`}
      className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium", dark ? "bg-white/[0.06] text-white/80" : "bg-black/[0.04] text-ink-2")}
    >
      <Icon size={11} style={{ color: h.color }} aria-hidden />
      {dv.device_type}
      {dv.battery_pct != null && <span className="tabular" style={{ color: dv.battery_pct < 20 ? h.color : undefined }}>{dv.battery_pct}%</span>}
      <span className="sr-only">({h.label})</span>
      {dv.health !== "online" && <span className="font-semibold" style={{ color: h.color }}>{h.label}</span>}
    </span>
  );
}

export function MonitorTile({ a, devices = [] }: { a: Alarm; devices?: DeviceRow[] }) {
  const sev = SEV[a.severity] ?? SEV.advisory;
  const v = vital(a);
  const kind = kindFor(a.alarm_type);
  const unacked = !a.acknowledged_at;
  return (
    <Link
      to={`/patients/${a.patient_id}`}
      className={cn("group block rounded-md bg-[#0b0d10] p-3 text-white shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand", sev.ring, a.severity === "critical" && unacked && "ring-2")}
    >
      <div className="flex items-center gap-2.5">
        <PatientAvatar size={36} seed={a.patient_id} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{a.synthetic_name ?? a.patient_id}</div>
          <div className="truncate text-[11px] text-white/55">{a.age ? `${a.age} y · ` : ""}{a.care_unit}</div>
        </div>
        <div className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold tracking-wide" style={{ color: sev.color, background: `${sev.color}1f` }}>
          <AlarmIcon type={a.alarm_type} severity={a.severity} />
          {sev.label}
        </div>
      </div>

      <div className="mt-2.5">
        <Oscilloscope kind={kind} color={kind === "flat" ? "#8a94a6" : kind === "pleth" ? "#5ec8ff" : sev.color} speed={kind === "fast" ? 2.6 : 4} label={`Illustrative trace for ${a.alarm_type}`} />
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold" style={{ color: sev.color }}>{a.alarm_type}</div>
          <div className="text-[11px] text-white/55">
            {a.trigger_value != null ? `triggered at ${Math.round(a.trigger_value)} ${a.trigger_unit ?? ""}` : "technical alarm"}
          </div>
        </div>
        {v && (
          <div className="text-right">
            <div className="text-[10px] font-medium text-white/55">{v.name} now</div>
            <div className="tabular text-2xl font-bold leading-none">{v.value}<span className="ml-0.5 text-[11px] font-medium text-white/55">{v.unit}</span></div>
          </div>
        )}
      </div>

      {devices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="IoT devices">
          {devices.map((dv) => <DeviceChip key={dv.device_id} dv={dv} />)}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-white/70"><NurseAvatar size={20} /> {a.assigned_nurse}</span>
        <span className={cn("font-semibold", unacked ? "text-[#ff8a8a]" : "text-white/55")}>{unacked ? "● Unacknowledged" : "◐ Acknowledged"}</span>
      </div>
    </Link>
  );
}
