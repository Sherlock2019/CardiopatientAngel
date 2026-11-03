import { Link } from "react-router-dom";
import { ChevronRight, Stethoscope } from "lucide-react";
import { Card, CardHeader } from "./ui";
import { DoctorAvatar, PatientAvatar } from "./Illustrations";

interface Ref { patient_id: string; synthetic_name: string; care_unit: string; care_team: string; doctor_in_charge: string }
export interface Hierarchy {
  hospital: string; service: string; monitored_patients: number;
  on_call: { doctor: string; shift: string };
  teams: { care_team: string; doctor_in_charge: string; patients: number }[];
  conditions: { condition: string; code: string | null; patients: number; doctors: { doctor: string; patients: number }[]; items: Ref[] }[];
}

export default function HierarchyPanel({ h }: { h: Hierarchy }) {
  const max = Math.max(1, ...h.conditions.map((c) => c.patients));
  return (
    <Card>
      <CardHeader
        title={`${h.hospital} / ${h.service} — patients by condition`}
        subtitle="Monitored patients grouped by active diagnosis (a patient can appear under several). Doctor roster is synthetic."
      />
      <div className="grid gap-3 p-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-[4px] border border-black/10 bg-black/[0.03] p-3">
            <DoctorAvatar size={44} />
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Doctor on call · {h.on_call.shift} shift</div>
              <div className="text-base font-semibold">{h.on_call.doctor}</div>
            </div>
          </div>
          <div className="rounded-[4px] border border-black/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted"><Stethoscope size={12} aria-hidden /> Doctors in charge</div>
            <ul className="space-y-1.5 text-xs">
              {h.teams.map((t) => (
                <li key={t.care_team} className="flex items-center gap-2">
                  <DoctorAvatar size={24} />
                  <span className="flex-1"><b className="font-medium">{t.doctor_in_charge}</b> <span className="text-muted">· {t.care_team}</span></span>
                  <span className="tabular font-semibold">{t.patients}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ul className="space-y-1" aria-label="Conditions">
          {h.conditions.map((c) => (
            <li key={c.condition}>
              <details className="group rounded-[4px] border border-black/10">
                <summary className="grid cursor-pointer list-none grid-cols-[16px_minmax(150px,1fr)_minmax(80px,2fr)_auto] items-center gap-3 px-3 py-2 text-xs hover:bg-black/5">
                  <ChevronRight size={14} className="transition group-open:rotate-90" aria-hidden />
                  <span>
                    <b className="font-medium">{c.condition}</b> {c.code && <span className="text-muted">{c.code}</span>}
                    <span className="block text-[11px] text-muted">{c.doctors.map((d) => `${d.doctor} (${d.patients})`).join(" · ")}</span>
                  </span>
                  <span className="h-2 rounded-sm bg-black/[0.04]"><span className="block h-2 rounded-sm bg-brand" style={{ width: `${(c.patients / max) * 100}%` }} /></span>
                  <span className="tabular w-10 text-right text-sm font-semibold">{c.patients}</span>
                </summary>
                <ul className="grid gap-1 border-t border-black/10 p-2 sm:grid-cols-2 xl:grid-cols-3">
                  {c.items.map((p) => (
                    <li key={p.patient_id}>
                      <Link to={`/patients/${p.patient_id}`} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-black/5">
                        <PatientAvatar size={22} seed={p.patient_id} />
                        <span className="min-w-0 flex-1 truncate"><b className="font-medium">{p.synthetic_name}</b> <span className="text-muted">· {p.care_unit}</span></span>
                        <span className="shrink-0 text-[11px] text-muted">{p.doctor_in_charge}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
