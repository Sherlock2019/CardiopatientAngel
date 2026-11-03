import { useState } from "react";
import { Link } from "react-router-dom";
import { BatteryLow, PlugZap, Radio, Wifi, WifiOff } from "lucide-react";
import { useApi } from "../lib/api";
import { useMeta } from "../lib/meta";
import { ago, fmtTime } from "../lib/format";
import { Badge, Card, CardHeader, Note, QueryBoundary, Select, Stat, cn } from "../components/ui";

export interface DeviceRow {
  device_id: string; device_type: string; model: string; firmware_version: string; connectivity: string;
  battery_pct: number | null; last_sync_at: string | null; minutes_since_sync: number | null; offline_after_min: number;
  health: "online" | "offline" | "low_battery" | "returned"; patient_id: string; synthetic_name?: string; care_unit?: string;
  signals: string[]; wearable: boolean;
}
export interface Fleet {
  total: number; summary: Record<"online" | "offline" | "low_battery", number>;
  by_type: { device_type: string; total: number; online: number; offline: number; low_battery: number; firmware: Record<string, number> }[];
  items: DeviceRow[];
}
interface Events {
  pending: number; target: string;
  items: { event_id: number; event_type: string; occurred_at: string; payload: Record<string, unknown>; status: string; delivered_at: string | null }[];
}

export function HealthBadge({ h }: { h: DeviceRow["health"] }) {
  if (h === "offline") return <Badge className="border-crit/40 bg-crit/5 text-crit"><WifiOff size={11} /> Offline</Badge>;
  if (h === "low_battery") return <Badge className="border-warn/70 bg-warn/15 text-ink"><BatteryLow size={11} /> Low battery</Badge>;
  if (h === "returned") return <Badge className="border-black/15 text-ink-2">Returned</Badge>;
  return <Badge className="border-good/40 bg-good/5 text-good-text"><Wifi size={11} /> Online</Badge>;
}

export function Battery({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="inline-flex items-center gap-1 text-muted"><PlugZap size={12} /> mains</span>;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Battery ${pct}%`}>
      <span className="relative h-2.5 w-8 rounded-sm border border-black/30">
        <span className={cn("absolute inset-y-0 left-0", pct < 20 ? "bg-crit" : "bg-good")} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular">{pct}%</span>
    </span>
  );
}

interface Profile {
  device_type: string; code: string; model: string; connectivity: string; battery_powered: boolean; offline_after_min: number;
  signals: { key: string; label: string; ucum: string; loinc: string; valid_range: [number, number] }[];
  alarm_rules: { alarm_type: string; technical: boolean; source: string }[];
}

function Profiles() {
  const q = useApi<Profile[]>(["device-profiles"], "/api/device-profiles", undefined, { staleTime: Infinity });
  return (
    <Card>
      <CardHeader
        title="Device profiles: one pipeline, many health IoT products"
        subtitle="Each product is a configuration the shared pipeline reads: signals (LOINC / UCUM), plausible ranges, alarm rules and offline rules. Adding a product = adding a profile and an adapter (docs/ADDING_A_DEVICE.md)."
      />
      <QueryBoundary q={q}>
        {(ps) => (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {ps.map((p) => (
              <div key={p.device_type} className="rounded-lg border border-black/10 bg-white p-3 text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{p.device_type}</span>
                  <code className="text-muted">{p.code}</code>
                </div>
                <div className="text-ink-2">{p.model} · {p.connectivity} · {p.battery_powered ? "battery" : "mains"} · offline after {p.offline_after_min} min</div>
                <table className="mt-2 w-full">
                  <thead><tr className="text-left text-muted"><th className="font-medium">Signal</th><th className="font-medium">LOINC</th><th className="font-medium">UCUM</th><th className="text-right font-medium">Valid range</th></tr></thead>
                  <tbody>
                    {p.signals.map((s) => (
                      <tr key={s.key} className="border-t border-black/5">
                        <td className="py-0.5">{s.label}</td><td className="tabular">{s.loinc}</td><td>{s.ucum}</td>
                        <td className="tabular text-right">{s.valid_range[0]}–{s.valid_range[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.alarm_rules.map((r) => (
                    <span key={r.alarm_type} className={cn("rounded border px-1.5 py-0.5", r.technical ? "border-dashed border-black/25 text-ink-2" : "border-black/15")}
                      title={r.source}>
                      {r.alarm_type}{r.source === "device event" ? " ◆" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>
      <p className="px-4 pb-3 text-[11px] text-muted">◆ = event reported by the device itself (e.g. fall detection); dashed = technical alarm. Other alarms come from the shared demo threshold rules.</p>
    </Card>
  );
}

export default function Devices() {
  const meta = useMeta();
  const [type, setType] = useState("");
  const [health, setHealth] = useState("");
  const [unit, setUnit] = useState("");
  const q = useApi<Fleet>(["devices"], "/api/devices", { device_type: type, health, unit }, { refetchInterval: 15_000 });
  const ev = useApi<Events>(["integration-events"], "/api/integration/events", { limit: 30 }, { refetchInterval: 5_000 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Devices &amp; Integrations</h1>
        <p className="text-xs text-muted">Monitoring device fleet for currently monitored patients (bedside, telemetry and wearables) and events sent to the connected virtual-care platform.</p>
      </div>
      {q.data && (
        <section aria-label="Fleet health" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={<Radio size={14} />} label="Devices in use" value={q.data.total} />
          <Stat icon={<Wifi size={14} />} label="Online" value={q.data.summary.online} />
          <Stat icon={<WifiOff size={14} />} label="Offline (no recent sync)" value={q.data.summary.offline} tone={q.data.summary.offline ? "crit" : undefined} />
          <Stat icon={<BatteryLow size={14} />} label="Battery below 20%" value={q.data.summary.low_battery} />
        </section>
      )}
      <Profiles />
      <Card>
        <CardHeader title="By device type" subtitle="Offline thresholds differ by type: bedside 10 min, telemetry 15 min, wearables 60–120 min (they sync through a phone gateway)" />
        <QueryBoundary q={q}>
          {(d) => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead><tr className="border-b border-black/10 text-left text-ink-2">{["Type", "Model", "Signals", "In use", "Online", "Offline", "Low battery", "Firmware versions"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {d.by_type.map((t) => {
                    const info = meta.data?.device_info?.[t.device_type];
                    return (
                      <tr key={t.device_type} className="border-b border-black/5">
                        <td className="px-3 py-2 font-medium">{t.device_type}</td>
                        <td className="px-3 py-2 text-ink-2">{info?.model} · {info?.connectivity}</td>
                        <td className="px-3 py-2 text-ink-2">{info?.signals.join(", ")}</td>
                        <td className="tabular px-3 py-2">{t.total}</td>
                        <td className="tabular px-3 py-2">{t.online}</td>
                        <td className="tabular px-3 py-2 font-semibold">{t.offline || ""}</td>
                        <td className="tabular px-3 py-2">{t.low_battery || ""}</td>
                        <td className="px-3 py-2">{Object.entries(t.firmware).map(([v, n]) => <span key={v} className="mr-2 inline-block rounded border border-black/10 px-1.5 py-0.5 tabular">v{v} ×{n}</span>)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title={`Device list${q.data ? ` · ${q.data.total}` : ""}`} subtitle="Problems first" right={
            <>
              <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All</option>{meta.data?.device_types.map((t) => <option key={t}>{t}</option>)}</Select>
              <Select label="Health" value={health} onChange={(e) => setHealth(e.target.value)}><option value="">All</option><option value="offline">Offline</option><option value="low_battery">Low battery</option><option value="online">Online</option></Select>
              <Select label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">All units</option>{meta.data?.care_units.map((u) => <option key={u}>{u}</option>)}</Select>
            </>
          } />
          <QueryBoundary q={q} empty={(d) => d.items.length === 0}>
            {(d) => (
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[720px] text-xs">
                  <thead className="sticky top-0 bg-surface"><tr className="border-b border-black/10 text-left text-ink-2">{["Device", "Patient", "Health", "Battery", "Last sync", "Firmware"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {d.items.map((dv) => (
                      <tr key={dv.device_id} className="border-b border-black/5">
                        <td className="px-3 py-1.5"><div className="font-medium">{dv.device_id}</div><div className="text-[11px] text-muted">{dv.device_type}</div></td>
                        <td className="px-3 py-1.5"><Link className="text-brand-dark hover:underline" to={`/patients/${dv.patient_id}`}>{dv.synthetic_name}</Link><div className="text-[11px] text-muted">{dv.care_unit}</div></td>
                        <td className="px-3 py-1.5"><HealthBadge h={dv.health} /></td>
                        <td className="px-3 py-1.5"><Battery pct={dv.battery_pct} /></td>
                        <td className="tabular px-3 py-1.5" title={fmtTime(dv.last_sync_at)}>{dv.last_sync_at ? ago(dv.last_sync_at) : "—"}</td>
                        <td className="tabular px-3 py-1.5">v{dv.firmware_version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </QueryBoundary>
        </Card>
        <Card>
          <CardHeader title="Integration outbox" subtitle={ev.data ? `Events to ${ev.data.target} · ${ev.data.pending} pending` : undefined} />
          <QueryBoundary q={ev} empty={(d) => d.items.length === 0}>
            {(d) => (
              <ul className="max-h-[520px] divide-y divide-black/5 overflow-auto text-xs">
                {d.items.map((e) => (
                  <li key={e.event_id} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-semibold">{e.event_type}</code>
                      {e.status === "delivered" ? <Badge className="border-good/40 text-good-text">✓ delivered</Badge> : <Badge className="border-warn/70 bg-warn/10 text-ink">◷ pending</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">{fmtTime(e.occurred_at)} · alarm #{String(e.payload.alarm_id)} · {String(e.payload.patient_id)}{e.payload.urgency ? ` · ${String(e.payload.urgency)}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
          <div className="p-3"><Note>Transactional outbox: events are written with the change that caused them and relayed to the platform afterwards (production: SQS/EventBridge with retries). Payloads carry identifiers only.</Note></div>
        </Card>
      </div>
    </div>
  );
}
