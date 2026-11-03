import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, HeartCrack, HeartPulse } from "lucide-react";
import { useApi } from "../lib/api";
import { TooltipBox } from "./charts";
import { Card, CardHeader, DataTable, QueryBoundary, Segmented, Select } from "./ui";

type Status = "Stable / recovered" | "At risk" | "Deceased";
type Dim = "Condition" | "Medication class" | "Age group" | "Sex" | "Doctor in charge";
interface Mix {
  patients: number; counts: Record<Status, number>; by: Dim | null;
  rows: { category: string; patients: number; counts: Record<Status, number> }[];
  options: Record<Dim, string[]>;
}

// validated with the dataviz palette script (CVD + normal-vision pass; amber needs visible labels, which every chart has)
export const STATUS: { key: Status; color: string; Icon: typeof HeartPulse }[] = [
  { key: "Stable / recovered", color: "#2a78d6", Icon: HeartPulse },
  { key: "At risk", color: "#e0a100", Icon: AlertTriangle },
  { key: "Deceased", color: "#c2410c", Icon: HeartCrack },
];

function MixDonut({ counts, size }: { counts: Record<Status, number>; size: number }) {
  const total = STATUS.reduce((s, x) => s + counts[x.key], 0);
  const data = STATUS.map((s) => ({ name: s.key, value: counts[s.key], color: s.color }));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="98%" startAngle={90} endAngle={-270} stroke="var(--color-surface)" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => active && payload?.length ? (
            <TooltipBox title={String(payload[0].name)} rows={[
              { label: "Patients", value: payload[0].value as number, color: (payload[0].payload as { color: string }).color },
              { label: "Share", value: total ? `${Math.round(((payload[0].value as number) / total) * 100)}%` : "—" },
            ]} />
          ) : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-bold text-ink" style={{ fontSize: size > 150 ? 22 : 13 }}>{total}</span>
        <span className="text-[9px] text-muted">patients</span>
      </div>
    </div>
  );
}

function Legend({ counts }: { counts: Record<Status, number> }) {
  const total = STATUS.reduce((s, x) => s + counts[x.key], 0) || 1;
  return (
    <ul className="space-y-1.5 text-xs">
      {STATUS.map(({ key, color, Icon }) => (
        <li key={key} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          <Icon size={13} className="text-ink-2" aria-hidden />
          <span className="flex-1 text-ink-2">{key}</span>
          <b className="tabular">{counts[key]}</b>
          <span className="tabular w-10 text-right text-muted">{Math.round((counts[key] / total) * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

export default function StatusMix({ doctor = "" }: { doctor?: string }) {
  const [f, setF] = useState({ condition: "", medication_class: "", age_group: "", sex: "", doctor });
  const [by, setBy] = useState<Dim>("Condition");
  const [view, setView] = useState<"chart" | "table">("chart");
  const q = useApi<Mix>(["status-mix", f, by], "/api/patients/status-mix", { ...f, by });
  const opts = q.data?.options;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader
        title="Patient status: stable, at risk, deceased"
        subtitle="All patients in the 90-day registry. At risk = monitored now with an unresolved warning/critical alarm or a critical alarm in the last 24 h (alarm-based, not a clinical risk score)."
        right={
          <>
            <Select label="Condition" value={f.condition} onChange={set("condition")}><option value="">All</option>{opts?.Condition.map((o) => <option key={o}>{o}</option>)}</Select>
            <Select label="Medication" value={f.medication_class} onChange={set("medication_class")}><option value="">All</option>{opts?.["Medication class"].map((o) => <option key={o}>{o}</option>)}</Select>
            <Select label="Age" value={f.age_group} onChange={set("age_group")}><option value="">All</option>{opts?.["Age group"].map((o) => <option key={o}>{o}</option>)}</Select>
            <Select label="Sex" value={f.sex} onChange={set("sex")}><option value="">All</option><option>Female</option><option>Male</option></Select>
            <Select label="Doctor" value={f.doctor} onChange={set("doctor")}><option value="">All</option>{opts?.["Doctor in charge"].map((o) => <option key={o}>{o}</option>)}</Select>
          </>
        }
      />
      <QueryBoundary q={q}>
        {(d) => (
          <div className="grid gap-5 p-4 lg:grid-cols-[260px_1fr]">
            <div className="flex flex-col items-center gap-4">
              <MixDonut counts={d.counts} size={180} />
              <div className="w-full"><Legend counts={d.counts} /></div>
            </div>
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Segmented label="Break down by" value={by} onChange={setBy}
                  options={(["Condition", "Medication class", "Age group", "Sex", "Doctor in charge"] as Dim[]).map((v) => ({ value: v, label: v }))} />
                <Segmented label="View" value={view} onChange={setView} options={[{ value: "chart", label: "Pies" }, { value: "table", label: "Table" }]} />
              </div>
              {view === "chart" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {d.rows.map((r) => (
                    <div key={r.category} className="flex flex-col items-center rounded-lg border border-black/10 p-2 text-center">
                      <div className="mb-1 h-8 text-[11.5px] font-medium leading-tight">{r.category}</div>
                      <MixDonut counts={r.counts} size={96} />
                      <div className="mt-1.5 space-y-0.5 text-[10.5px] text-muted">
                        {STATUS.map((s) => <div key={s.key} className="tabular"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{r.counts[s.key]} {s.key === "Stable / recovered" ? "stable" : s.key.toLowerCase()}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <DataTable
                  columns={[{ key: "category", label: by }, { key: "patients", label: "Patients", align: "right" },
                    ...STATUS.map((s) => ({ key: s.key, label: s.key, align: "right" as const }))]}
                  rows={d.rows.map((r) => ({ category: r.category, patients: r.patients, ...r.counts }))}
                />
              )}
              <p className="mt-3 text-[11px] text-muted">A patient can count under several conditions or medication classes. Synthetic data; associations only.</p>
            </div>
          </div>
        )}
      </QueryBoundary>
    </Card>
  );
}
