import { Fragment, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Check, ClipboardCheck, Video } from "lucide-react";
import { Battery, HealthBadge, type DeviceRow } from "./Devices";
import { api, useApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMeta } from "../lib/meta";
import { ago, fmtDate, fmtNum, fmtTime, MEAS_LABEL } from "../lib/format";
import type { Alarm, Attention } from "../lib/types";
import { AttentionFactors, useAcknowledge } from "../components/AlarmTable";
import { AXIS, Legend, SERIES, TooltipBox } from "../components/charts";
import { Badge, Button, Card, CardHeader, Empty, ErrorState, Loading, Note, Segmented, SeverityBadge, StatusBadge } from "../components/ui";

interface Detail {
  patient_id: string; synthetic_name: string; date_of_birth: string; age: number; age_group: string; sex: string;
  admission_date: string; monitoring_end: string | null; monitoring_days: number; care_unit: string; monitoring_status: string;
  discharge_outcome: string | null; assigned_care_team: string; device_id: string; device_type: string;
  doctor_in_charge?: string | null; family_contact?: { name: string | null; relation: string | null; phone: string | null };
  diagnoses: { diagnosis_id: number; diagnosis_code: string; pathology_name: string; diagnosis_date: string; resolved_date: string | null; active_status: boolean }[];
  medications: { medication_id: number; medication_name: string; medication_class: string; prescribed_dose: string; route: string; start_time: string; end_time: string | null; status: string }[];
  treatments: { treatment_id: number; treatment_type: string; start_date: string; end_date: string | null; status: string }[];
  reviews: { review_id: number; alarm_id: number; reviewer: string; review_timestamp: string; disposition: string; notes: string | null }[];
  alarm_totals: { total: number; resolved: number; critical: number };
  attention: Attention | null;
  device: DeviceRow | null;
  checkins: { submitted_at: string; feeling: number; symptoms: string[]; took_medications: boolean; notes: string | null; source: string }[];
}
interface Meas { measurement_type: string; numeric_value: number | null; observed_at: string; quality_status: string; latency_seconds: number }

const VITALS = [
  { title: "Heart rate", unit: "bpm", series: [{ key: "heart_rate", label: "HR", color: SERIES[0] }], refs: [50, 110], domain: [30, 180] },
  { title: "Blood pressure", unit: "mmHg", series: [{ key: "systolic_bp", label: "Systolic", color: SERIES[0] }, { key: "diastolic_bp", label: "Diastolic", color: SERIES[1] }], refs: [90, 175], domain: [40, 220] },
  { title: "Oxygen saturation", unit: "%", series: [{ key: "spo2", label: "SpO₂", color: SERIES[0] }], refs: [92], domain: [75, 100] },
  { title: "Sleep (nightly, from ring)", unit: "h", series: [{ key: "sleep_hours", label: "Sleep", color: SERIES[0] }], refs: [], domain: [0, 12] },
];

function VitalChart({ v, rows }: { v: (typeof VITALS)[number]; rows: Record<string, number | null>[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold">{v.title} <span className="font-normal text-muted">({v.unit})</span></h3>
        {v.series.length > 1 && <Legend items={v.series.map((s) => ({ label: s.label, color: s.color }))} />}
      </div>
      <div className="h-36">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => fmtTime(new Date(t).toISOString())} {...AXIS} tickLine={false} minTickGap={50} />
            <YAxis domain={v.domain} {...AXIS} width={32} tickLine={false} axisLine={false} />
            {v.refs.map((r) => <ReferenceLine key={r} y={r} stroke="#898781" strokeDasharray="4 3" label={{ value: `demo limit ${r}`, position: "insideTopRight", fontSize: 9, fill: "#898781" }} />)}
            <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
              <TooltipBox title={fmtTime(new Date(label as number).toISOString())} rows={payload.map((p) => ({ label: String(p.name), value: `${fmtNum(p.value as number)} ${v.unit}`, color: p.color }))} />
            ) : null} />
            {v.series.map((s) => <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={s.key === "sleep_hours" ? { r: 3 } : false} connectNulls={s.key === "sleep_hours"} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Timeline({ d }: { d: Detail }) {
  const start = new Date(d.admission_date).getTime();
  const end = d.monitoring_end ? new Date(d.monitoring_end).getTime() : Date.now();
  const span = Math.max(1, end - start);
  const pos = (iso: string | null, fallback: number) => Math.min(100, Math.max(0, (((iso ? new Date(iso).getTime() : fallback) - start) / span) * 100));
  const rows = [
    ...d.diagnoses.filter((x) => x.active_status).map((x) => ({ group: "Diagnosis", label: `${x.pathology_name} (${x.diagnosis_code})`, s: x.diagnosis_date, e: x.resolved_date, color: SERIES[2], detail: `since ${fmtDate(x.diagnosis_date)}` })),
    ...d.medications.map((m) => ({ group: "Medication", label: `${m.medication_name} ${m.prescribed_dose} ${m.route}`, s: m.start_time, e: m.end_time, color: SERIES[0], detail: `${m.medication_class} · ${m.status}` })),
    ...d.treatments.map((t) => ({ group: "Treatment", label: t.treatment_type, s: t.start_date, e: t.end_date, color: SERIES[6], detail: t.status })),
  ];
  return (
    <div className="text-xs">
      <div className="mb-1 flex justify-between pl-[38%] text-[11px] text-muted"><span>Admitted {fmtTime(d.admission_date)}</span><span>{d.monitoring_end ? `Ended ${fmtTime(d.monitoring_end)}` : "Now"}</span></div>
      {rows.map((r, i) => {
        const l = pos(r.s, start);
        const w = Math.max(0.8, pos(r.e, end) - l);
        const before = new Date(r.s).getTime() < start;
        return (
          <div key={i} className="grid grid-cols-[38%_1fr] items-center gap-2 border-t border-black/5 py-1">
            <div className="truncate" title={`${r.label} — ${r.detail}`}>
              <span className="mr-1 text-[10px] uppercase tracking-wide text-muted">{r.group}</span> {r.label}
              <div className="text-[10px] text-muted">{r.detail}{before ? ` · started ${fmtDate(r.s)}` : ""}</div>
            </div>
            <div className="relative h-3 rounded-sm bg-black/[0.03]">
              <div className="absolute top-0 h-3 rounded-[4px]" style={{ left: `${l}%`, width: `${w}%`, background: r.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ResolveForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const meta = useMeta();
  const qc = useQueryClient();
  const [disposition, setDisposition] = useState("");
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/api/alarms/${alarm.alarm_id}/resolve`, { method: "POST", body: JSON.stringify({ disposition, notes: notes || null }) }),
    onSuccess: () => {
      ["patient-alarms", "patient", "alarms", "summary", "audit"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onDone();
    },
  });
  return (
    <form className="flex flex-wrap items-end gap-2 bg-brand-soft/40 p-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <label className="text-xs">Disposition
        <select required value={disposition} onChange={(e) => setDisposition(e.target.value)} className="ml-1 h-8 rounded-md border border-black/15 bg-white px-2 text-xs">
          <option value="">Select…</option>{meta.data?.dispositions.map((x) => <option key={x}>{x}</option>)}
        </select>
      </label>
      <label className="flex-1 text-xs">Review note
        <input value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className="ml-1 h-8 w-full min-w-48 rounded-md border border-black/15 bg-white px-2 text-xs" placeholder="Optional (synthetic data only)" />
      </label>
      <Button size="sm" variant="primary" disabled={!disposition || m.isPending}><ClipboardCheck size={12} /> Record review & resolve</Button>
      <Button size="sm" type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      {m.error && <span role="alert" className="text-xs text-crit">{(m.error as Error).message}</span>}
    </form>
  );
}

export default function PatientDetail() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const [hours, setHours] = useState("72");
  const [resolving, setResolving] = useState<number | null>(null);
  const ack = useAcknowledge();
  const qc = useQueryClient();
  const [consulted, setConsulted] = useState<Set<number>>(new Set());
  const consult = useMutation({
    mutationFn: (id: number) => api(`/api/alarms/${id}/consult-request`, { method: "POST", body: JSON.stringify({ urgency: "urgent" }) }),
    onSuccess: (_d, id) => {
      setConsulted((s) => new Set(s).add(id));
      qc.invalidateQueries({ queryKey: ["integration-events"] });
    },
  });
  const p = useApi<Detail>(["patient", id], `/api/patients/${id}`);
  const meas = useApi<{ items: Meas[]; quality_counts: Record<string, number> }>(["patient-meas", id], `/api/patients/${id}/measurements`, { hours });
  const alarms = useApi<{ items: Alarm[] }>(["patient-alarms", id], `/api/patients/${id}/alarms`, { limit: 300 });

  const rows = useMemo(() => {
    const by = new Map<number, Record<string, number | null>>();
    for (const m of meas.data?.items ?? []) {
      if (m.quality_status === "artifact") continue; // artifacts excluded from trends
      const t = new Date(m.observed_at).getTime();
      const r = by.get(t) ?? { t };
      r[m.measurement_type] = m.numeric_value;
      by.set(t, r);
    }
    return [...by.values()].sort((a, b) => (a.t as number) - (b.t as number));
  }, [meas.data]);

  if (p.isLoading) return <Loading />;
  if (p.error) return <ErrorState error={p.error} />;
  const d = p.data!;
  const q = meas.data?.quality_counts ?? {};

  return (
    <div className="space-y-4">
      <Link to="/patients" className="inline-flex items-center gap-1 text-xs text-brand-dark hover:underline"><ArrowLeft size={12} /> Patients</Link>
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{d.synthetic_name}</h1>
              <Badge className="border-black/15 text-ink-2">Synthetic</Badge>
              {d.monitoring_status === "active" ? <Badge className="border-good/40 bg-good/5 text-good-text">● Monitored now</Badge>
                : <Badge className="border-black/20 text-ink">{d.discharge_outcome === "Deceased" ? "✝ Deceased" : "↗ Discharged alive"}</Badge>}
            </div>
            <p className="mt-1 text-xs text-ink-2">
              {d.patient_id} · {d.age} y ({d.age_group}) · {d.sex === "F" ? "Female" : "Male"} · DOB {d.date_of_birth} · {d.care_unit} · {d.assigned_care_team}
            </p>
            <p className="text-xs text-muted">
              Admitted {fmtTime(d.admission_date)} · {d.monitoring_end ? `monitoring ended ${fmtTime(d.monitoring_end)}` : "monitoring ongoing"} · {d.monitoring_days} days · {d.device_type} {d.device_id}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              {d.doctor_in_charge && <span><b className="font-medium">Doctor in charge:</b> {d.doctor_in_charge}</span>}
              {d.family_contact?.name && (
                <span><b className="font-medium">Family contact:</b> {d.family_contact.name} ({d.family_contact.relation}) · <a className="text-brand-dark hover:underline" href={`tel:${d.family_contact.phone?.replace(/[^\d+]/g, "")}`}>{d.family_contact.phone}</a></span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-center text-xs">
            <div><dt className="text-muted">Alarms (stay)</dt><dd className="tabular text-lg font-semibold">{d.alarm_totals.total}</dd></div>
            <div><dt className="text-muted">Critical</dt><dd className="tabular text-lg font-semibold">{d.alarm_totals.critical}</dd></div>
            <div><dt className="text-muted">Reviews</dt><dd className="tabular text-lg font-semibold">{d.reviews.length}</dd></div>
          </dl>
        </div>
        {d.device && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs">
            <span className="font-semibold">{d.device.device_type}</span>
            <span className="text-ink-2">{d.device.model} · {d.device.connectivity} · firmware v{d.device.firmware_version}</span>
            <HealthBadge h={d.device.health} />
            <Battery pct={d.device.battery_pct} />
            <span className="text-ink-2">last sync {d.device.last_sync_at ? ago(d.device.last_sync_at) : "—"}</span>
            <span className="text-muted">measures: {d.device.signals.map((s) => MEAS_LABEL[s] ?? s).join(", ")}</span>
          </div>
        )}
        {d.attention && d.attention.score > 0 && (
          <div className="mt-3 rounded-lg border border-black/10 bg-white p-3"><AttentionFactors a={d.attention} /></div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Vital-sign trends"
            subtitle={`Window ends ${d.monitoring_end ? "at end of monitoring" : "now"} · quality: ${Object.entries(q).map(([k, v]) => `${v} ${k}`).join(", ") || "—"} · gaps = missing readings`}
            right={<Segmented label="Trend window" value={hours} onChange={setHours} options={[{ value: "24", label: "24 h" }, { value: "72", label: "72 h" }, { value: "168", label: "7 d" }, { value: "720", label: "Stay" }]} />}
          />
          <div className="space-y-3 p-4">
            {meas.isLoading ? <Loading /> : rows.length === 0 ? <Empty>No readings in this window.</Empty> : VITALS
              .filter((v) => v.series.some((s) => rows.some((r) => r[s.key] !== undefined)))
              .map((v) => <VitalChart key={v.title} v={v} rows={rows} />)}
          </div>
        </Card>
        <Card>
          <CardHeader title="Clinical timeline" subtitle="Active diagnoses, medications and treatments across the monitoring stay" />
          <div className="p-4"><Timeline d={d} /></div>
          <div className="border-t border-black/5 p-4">
            <h3 className="mb-1 text-xs font-semibold">Diagnosis history</h3>
            <table className="w-full text-xs">
              <tbody>
                {d.diagnoses.map((x) => (
                  <tr key={x.diagnosis_id} className="border-t border-black/5">
                    <td className="py-1">{x.pathology_name}</td><td className="text-muted">{x.diagnosis_code}</td>
                    <td className="tabular">{fmtDate(x.diagnosis_date)}</td>
                    <td>{x.active_status ? "Active" : `Resolved ${fmtDate(x.resolved_date)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Alarm timeline" subtitle={`${alarms.data?.items.length ?? 0} most recent alarms`} />
        {alarms.isLoading ? <Loading /> : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-black/10 text-left text-ink-2">
                  {["Triggered", "Alarm", "Severity", "Value", "Acknowledged", "Resolved", "Nurse", "Status", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {alarms.data?.items.map((a) => (
                  <Fragment key={a.alarm_id}>
                    <tr className="border-b border-black/5">
                      <td className="tabular px-3 py-1.5">{fmtTime(a.triggered_at)}</td>
                      <td className="px-3 py-1.5 font-medium">{a.alarm_type}{a.source?.startsWith("edge-ai") && <div className="text-[10px] font-normal text-muted">on-device AI · {a.source.replace("edge-ai ", "")}</div>}</td>
                      <td className="px-3 py-1.5"><SeverityBadge severity={a.severity} /></td>
                      <td className="tabular px-3 py-1.5">{fmtNum(a.trigger_value, 0)} {a.trigger_unit}</td>
                      <td className="tabular px-3 py-1.5">{a.acknowledged_at ? `${fmtTime(a.acknowledged_at)} · ${a.acknowledged_by}` : "—"}</td>
                      <td className="tabular px-3 py-1.5">{fmtTime(a.resolved_at)}</td>
                      <td className="px-3 py-1.5 text-ink-2">{a.assigned_nurse}</td>
                      <td className="px-3 py-1.5"><StatusBadge status={a.clinical_review_status} acknowledged={!!a.acknowledged_at} resolved={!!a.resolved_at} /></td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          {!a.acknowledged_at && can("acknowledge_alarm") && (
                            <Button size="sm" variant="primary" onClick={() => ack.mutate(a.alarm_id)} aria-label={`Acknowledge alarm ${a.alarm_id}`}><Check size={12} /> Acknowledge</Button>
                          )}
                          {!a.resolved_at && can("review_alarm") && (
                            <>
                              <Button size="sm" onClick={() => setResolving(a.alarm_id)}>Review…</Button>
                              <Button size="sm" variant="ghost" disabled={consult.isPending || consulted.has(a.alarm_id)}
                                onClick={() => consult.mutate(a.alarm_id)} aria-label={`Request virtual consult for alarm ${a.alarm_id}`}
                                title="Ask the connected virtual-care platform to open a video consult">
                                <Video size={12} /> {consulted.has(a.alarm_id) ? "Consult requested" : "Virtual consult"}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {resolving === a.alarm_id && (
                      <tr><td colSpan={9}><ResolveForm alarm={a} onDone={() => setResolving(null)} /></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {d.checkins.length > 0 && (
        <Card>
          <CardHeader title="Patient-reported check-ins (mobile app)" subtitle="Self-reported by the patient; not clinically verified" />
          <table className="w-full text-xs">
            <tbody>
              {d.checkins.map((c) => (
                <tr key={c.submitted_at} className="border-b border-black/5">
                  <td className="tabular px-4 py-1.5">{fmtTime(c.submitted_at)}</td>
                  <td className="px-2">Feeling {c.feeling}/5</td>
                  <td className={c.symptoms.length ? "px-2 font-medium" : "px-2 text-muted"}>{c.symptoms.join(", ") || "no symptoms"}</td>
                  <td className="px-2">{c.took_medications ? "✓ took medications" : "✗ missed medications"}</td>
                  <td className="px-2 text-ink-2">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <CardHeader title="Clinical review history" />
        {d.reviews.length === 0 ? <Empty>No reviews recorded.</Empty> : (
          <table className="w-full text-xs">
            <tbody>
              {d.reviews.map((r) => (
                <tr key={r.review_id} className="border-b border-black/5">
                  <td className="tabular px-4 py-1.5">{fmtTime(r.review_timestamp)}</td>
                  <td className="px-2">Alarm #{r.alarm_id}</td>
                  <td className="px-2 font-medium">{r.disposition}</td>
                  <td className="px-2 text-ink-2">{r.reviewer}</td>
                  <td className="px-2 text-muted">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Note>All records are synthetic. Thresholds shown on charts are fixed demonstration limits, not patient-specific clinical alarm limits.</Note>
    </div>
  );
}
