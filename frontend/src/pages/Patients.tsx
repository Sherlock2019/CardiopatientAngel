import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useApi } from "../lib/api";
import { useMeta } from "../lib/meta";
import { fmtDate } from "../lib/format";
import { Badge, Button, Card, CardHeader, QueryBoundary, Select } from "../components/ui";

interface Row {
  patient_id: string; synthetic_name: string; age: number; age_group: string; sex: string; care_unit: string;
  monitoring_status: string; discharge_outcome: string | null; admission_date: string; monitoring_end: string | null;
  device_type: string; diagnoses: string[]; alarms_total: number; alarms_24h: number; active_alarms: number;
}

export default function Patients() {
  const meta = useMeta();
  const [f, setF] = useState({ search: "", unit: "", age_group: "", status: "active", pathology: "", sort: "alarms_24h", page: 1 });
  const set = (k: string, v: string | number) => setF((p) => ({ ...p, [k]: v, page: k === "page" ? (v as number) : 1 }));
  const q = useApi<{ total: number; items: Row[]; page_size: number }>(["patients"], "/api/patients", { ...f, page_size: 25 });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Patients</h1>
      <Card>
        <CardHeader
          title="Synthetic patient registry"
          subtitle={q.data ? `${q.data.total.toLocaleString()} patients match` : undefined}
          right={
            <>
              <label className="relative">
                <span className="sr-only">Search patients</span>
                <Search size={14} className="absolute left-2 top-2 text-muted" aria-hidden />
                <input value={f.search} onChange={(e) => set("search", e.target.value)} placeholder="Name or ID" className="h-8 w-44 rounded-md border border-black/15 bg-white pl-7 pr-2 text-xs" />
              </label>
              <Select label="Status" value={f.status} onChange={(e) => set("status", e.target.value)}>
                <option value="">All</option><option value="active">Monitored now</option><option value="discharged">Stay completed</option>
              </Select>
              <Select label="Unit" value={f.unit} onChange={(e) => set("unit", e.target.value)}>
                <option value="">All units</option>{meta.data?.care_units.map((u) => <option key={u}>{u}</option>)}
              </Select>
              <Select label="Age" value={f.age_group} onChange={(e) => set("age_group", e.target.value)}>
                <option value="">All</option>{meta.data?.age_groups.map((u) => <option key={u}>{u}</option>)}
              </Select>
              <Select label="Diagnosis" value={f.pathology} onChange={(e) => set("pathology", e.target.value)}>
                <option value="">All</option>{meta.data?.pathologies.map((u) => <option key={u}>{u}</option>)}
              </Select>
              <Select label="Sort" value={f.sort} onChange={(e) => set("sort", e.target.value)}>
                <option value="alarms_24h">Alarms 24 h</option><option value="active_alarms">Active alarms</option>
                <option value="alarms_total">Alarms total</option><option value="age">Age</option>
                <option value="admission_date">Admission</option><option value="patient_id">ID</option>
              </Select>
            </>
          }
        />
        <QueryBoundary q={q} empty={(d) => d.items.length === 0}>
          {(d) => (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead>
                    <tr className="border-b border-black/10 text-left text-ink-2">
                      {["Patient", "Age / sex", "Unit", "Current diagnoses", "Admitted", "Status", "Active", "24 h", "Total"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 font-medium ${i >= 6 ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((p) => (
                      <tr key={p.patient_id} className="border-b border-black/5 hover:bg-brand-soft/40">
                        <td className="px-3 py-2">
                          <Link to={`/patients/${p.patient_id}`} className="font-medium text-brand-dark hover:underline">{p.synthetic_name}</Link>
                          <div className="text-[11px] text-muted">{p.patient_id} · {p.device_type}</div>
                        </td>
                        <td className="tabular px-3 py-2">{p.age} · {p.sex}</td>
                        <td className="px-3 py-2">{p.care_unit}</td>
                        <td className="px-3 py-2 text-ink-2">{p.diagnoses.join(", ") || "—"}</td>
                        <td className="tabular px-3 py-2">{fmtDate(p.admission_date)}</td>
                        <td className="px-3 py-2">
                          {p.monitoring_status === "active" ? <Badge className="border-good/40 bg-good/5 text-good-text">● Monitored</Badge>
                            : p.discharge_outcome === "Deceased" ? <Badge className="border-black/20 bg-black/[0.04] text-ink">✝ Deceased</Badge>
                            : <Badge className="border-black/15 text-ink-2">↗ Discharged</Badge>}
                        </td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{p.active_alarms || ""}</td>
                        <td className="tabular px-3 py-2 text-right">{p.alarms_24h}</td>
                        <td className="tabular px-3 py-2 text-right text-ink-2">{p.alarms_total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-xs text-ink-2">
                <span>Page {f.page} of {Math.max(1, Math.ceil(d.total / d.page_size))}</span>
                <div className="flex gap-2">
                  <Button size="sm" disabled={f.page <= 1} onClick={() => set("page", f.page - 1)}>Previous</Button>
                  <Button size="sm" disabled={f.page * d.page_size >= d.total} onClick={() => set("page", f.page + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}
