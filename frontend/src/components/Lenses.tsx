import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, ExternalLink, Phone, Pill, Search } from "lucide-react";
import { useApi } from "../lib/api";
import { useMeta } from "../lib/meta";
import type { Alarm } from "../lib/types";
import type { Row } from "../pages/Patients";
import type { Hierarchy } from "./Hierarchy";
import HierarchyPanel from "./Hierarchy";
import { DoctorAvatar, PatientAvatar } from "./Illustrations";
import { MonitorTile } from "./Monitor";
import OutcomeComparison from "./OutcomeComparison";
import PatientCalendar from "./PatientCalendar";
import StatusMix from "./StatusMix";
import { Badge, Card, CardHeader, QueryBoundary, Select, cn } from "./ui";

export function PatientCard({ p }: { p: Row }) {
  const status = p.discharge_outcome === "Deceased" ? { label: "✝ Deceased", cls: "border-[#c2410c]/40 text-[#c2410c]" }
    : p.monitoring_status !== "active" ? { label: "↗ Discharged alive", cls: "border-[#2a78d6]/40 text-brand-dark" }
    : p.active_alarms > 0 ? { label: "⚠ Active alarms", cls: "border-[#e0a100]/60 text-[#8a5a00]" }
    : { label: "● Stable", cls: "border-good/40 text-good-text" };
  return (
    <Link to={`/patients/${p.patient_id}`} className="block rounded-[4px] border border-black/10 bg-surface p-3 transition hover:border-brand/50">
      <div className="flex items-center gap-2.5">
        <PatientAvatar size={38} seed={p.patient_id} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.synthetic_name}</div>
          <div className="truncate text-[11px] text-muted">{p.patient_id} · {p.age} · {p.sex} · {p.care_unit}</div>
        </div>
        <Badge className={status.cls}>{status.label}</Badge>
      </div>
      <div className="mt-2 space-y-1 text-[11.5px] text-ink-2">
        <div className="truncate"><b className="font-medium">Conditions:</b> {p.diagnoses.join(", ") || "—"}</div>
        <div className="truncate"><Pill size={11} className="mr-1 inline text-brand" aria-hidden />{p.current_medications.join(", ") || "no current medications"}</div>
        {p.family_contact?.name && <div className="truncate"><Phone size={11} className="mr-1 inline" aria-hidden />{p.family_contact.name} ({p.family_contact.relation}) · {p.family_contact.phone}</div>}
        <div className="flex justify-between text-muted">
          <span>{p.doctor_in_charge ?? "—"}</span>
          <span className="tabular"><BellRing size={11} className="mr-0.5 inline" aria-hidden />{p.active_alarms} active · {p.alarms_24h} in 24 h</span>
        </div>
      </div>
    </Link>
  );
}

export function DoctorLens({ h, alarms, me }: { h?: Hierarchy; alarms?: Alarm[]; me?: string }) {
  const roster = h?.teams.map((t) => t.doctor_in_charge) ?? [];
  const [doctor, setDoctor] = useState<string>(me && roster.includes(me) ? me : "");
  const current = doctor || (me && roster.includes(me) ? me : roster[0] ?? "");
  const mine = useApi<{ total: number; items: Row[] }>(["patients", "doctor", current], "/api/patients",
    { doctor: current, status: "active", sort: "active_alarms", page_size: 12 }, { enabled: !!current });
  const critical = (alarms ?? []).filter((a) => a.severity === "critical");
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><DoctorAvatar size={26} /> Doctor's patients — {current || "…"}</span>}
          subtitle={mine.data ? `${mine.data.total} monitored patients in this doctor's care team, most active alarms first` : undefined}
          right={<Select label="Doctor in charge" value={current} onChange={(e) => setDoctor(e.target.value)}>{roster.map((r) => <option key={r}>{r}</option>)}</Select>}
        />
        <QueryBoundary q={mine}>
          {(d) => <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{d.items.map((p) => <PatientCard key={p.patient_id} p={p} />)}</div>}
        </QueryBoundary>
      </Card>
      <Card>
        <CardHeader title="Critical alarms for doctor review" subtitle={`${critical.length} unresolved critical alarm(s) in the priority queue`} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
          {critical.length ? critical.slice(0, 6).map((a) => <MonitorTile key={a.alarm_id} a={a} />) : <p className="text-xs text-muted">None right now.</p>}
        </div>
      </Card>
      {current && <StatusMix key={current} doctor={current} />}
      {h && <HierarchyPanel h={h} />}
      <OutcomeComparison />
    </div>
  );
}

export function PatientLens() {
  const meta = useMeta();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const q = useApi<{ total: number; items: Row[] }>(["patients", "lens", search, status], "/api/patients",
    { search, status, sort: "active_alarms", page_size: 24 });
  const app = `${location.protocol}//${location.hostname}:${meta.data?.mobile_port ?? 8081}`;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader
          title="Patients view"
          subtitle={q.data ? `${q.data.total} patients · conditions, current medications, family contact and doctor in charge` : undefined}
          right={
            <>
              <label className="relative">
                <span className="sr-only">Search patients</span>
                <Search size={14} className="absolute left-2 top-2 text-muted" aria-hidden />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or ID" className="h-8 w-44 rounded-md border border-black/15 bg-white pl-7 pr-2 text-xs" />
              </label>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Monitored now</option><option value="discharged">Stay completed</option><option value="">All</option>
              </Select>
              <a href={app} target="_blank" rel="noreferrer" className={cn("flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-white")}>
                Patient app <ExternalLink size={12} aria-hidden />
              </a>
            </>
          }
        />
        <QueryBoundary q={q} empty={(d) => d.items.length === 0}>
          {(d) => <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{d.items.map((p) => <PatientCard key={p.patient_id} p={p} />)}</div>}
        </QueryBoundary>
      </Card>
      <PatientCalendar />
    </div>
  );
}
