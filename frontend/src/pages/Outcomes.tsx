import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { HeartCrack, HeartPulse } from "lucide-react";
import { useApi } from "../lib/api";
import type { AnalyticsFilters } from "../lib/meta";
import { fmtNum } from "../lib/format";
import type { OutcomeRow, Outcomes as OutcomesData } from "../lib/types";
import { FilterBar, toParams } from "../components/FilterBar";
import { OUTCOME, TooltipBox } from "../components/charts";
import { Badge, ChartCard, DataTable, Note, QueryBoundary, Stat } from "../components/ui";

const SECTIONS: { dimension: string; title: string; subtitle: string }[] = [
  { dimension: "Signs during stay", title: "Signs during stay", subtitle: "Monitored signs seen in the patient's alarms (fast or slow heart rate, low oxygen, blood pressure, irregular rhythm, falls)" },
  { dimension: "Disease", title: "Conditions", subtitle: "Diagnoses active during the stay" },
  { dimension: "Treatment", title: "Treatments", subtitle: "Treatments during the stay" },
  { dimension: "Age group", title: "Age", subtitle: "Age at admission" },
  { dimension: "Medication class", title: "Medication classes", subtitle: "Classes given during the stay" },
  { dimension: "Care unit", title: "Care unit", subtitle: "Unit of the stay" },
];

function Donut({ deceased, alive, size = 120, center }: { deceased: number; alive: number; size?: number; center?: string }) {
  const data = [{ name: "Deceased", value: deceased, color: OUTCOME.deceased }, { name: "Discharged alive", value: alive, color: OUTCOME.alive }];
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="62%" outerRadius="98%" startAngle={90} endAngle={-270} stroke="#fcfcfb" strokeWidth={2} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => active && payload?.length ? (
            <TooltipBox title={String(payload[0].name)} rows={[{ label: "Patients", value: payload[0].value as number, color: (payload[0].payload as { color: string }).color }]} />
          ) : null} />
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="tabular text-sm font-bold text-ink">{center}</span><span className="text-[9px] text-muted">deceased</span></div>}
    </div>
  );
}

function CategoryPie({ r }: { r: OutcomeRow }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-black/10 bg-white p-3 text-center"
      aria-label={`${r.category}: ${r.deceased_n} deceased, ${r.alive_n} discharged alive, mortality ${fmtNum(r.mortality_pct)} percent`}>
      <div className="mb-1 min-h-[32px] text-xs font-semibold leading-tight text-ink">{r.category}</div>
      {r.patients === 0 ? <div className="flex h-[110px] items-center text-[11px] text-muted">no patients</div>
        : <Donut deceased={r.deceased_n} alive={r.alive_n} size={110} center={`${fmtNum(r.mortality_pct)}%`} />}
      <div className="tabular mt-1 text-[11px] text-ink-2">
        <span style={{ color: OUTCOME.deceased }}>●</span> {r.deceased_n} · <span style={{ color: OUTCOME.alive }}>●</span> {r.alive_n}
      </div>
      <div className="text-[10.5px] text-muted">n={r.patients}{r.mortality_ci_low !== null ? ` · CI ${fmtNum(r.mortality_ci_low)}–${fmtNum(r.mortality_ci_high)}%` : ""}</div>
      {r.small_cohort && r.patients > 0 && <Badge className="mt-1 border-warn/60 bg-warn/10 text-ink">small n</Badge>}
    </div>
  );
}

export default function Outcomes() {
  const [f, setF] = useState<AnalyticsFilters & { preset?: string }>({ preset: "90" });
  const q = useApi<OutcomesData>(["outcomes"], "/api/analytics/outcomes", toParams(f));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Outcomes dashboard</h1>
        <p className="text-xs text-muted">Completed stays: deceased vs. discharged alive, by signs, conditions, treatments and age. Each donut shows one group; the centre is that group's in-hospital mortality.</p>
      </div>
      <FilterBar value={f} onChange={setF} showTz={false} />
      <QueryBoundary q={q}>
        {(d) => (
          <>
            <div className="grid gap-3 md:grid-cols-[repeat(4,1fr)_auto]">
              <Stat label="Completed stays" value={d.completed_stays.toLocaleString()} />
              <Stat icon={<HeartCrack size={14} />} label="Deceased" value={d.deceased.patients.toLocaleString()} hint={`median age ${fmtNum(d.deceased.median_age)}`} />
              <Stat icon={<HeartPulse size={14} />} label="Discharged alive" value={d.alive.patients.toLocaleString()} hint={`median age ${fmtNum(d.alive.median_age)}`} />
              <Stat label="In-hospital mortality" value={`${fmtNum(d.mortality_pct)}%`} hint={`95% CI ${fmtNum(d.mortality_ci_low)}–${fmtNum(d.mortality_ci_high)}%`} tone="brand" />
              <div className="flex items-center justify-center rounded-xl border border-black/10 bg-surface px-4">
                <Donut deceased={d.deceased.patients} alive={d.alive.patients} size={110} center={`${fmtNum(d.mortality_pct)}%`} />
                <div className="ml-3 space-y-1 text-xs">
                  <div><span style={{ color: OUTCOME.deceased }}>●</span> Deceased</div>
                  <div><span style={{ color: OUTCOME.alive }}>●</span> Discharged alive</div>
                </div>
              </div>
            </div>
            {SECTIONS.map((s) => {
              const rows = d.dimensions.find((x) => x.dimension === s.dimension)?.rows ?? [];
              return (
                <ChartCard key={s.dimension} title={s.title} subtitle={s.subtitle}
                  chart={<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">{rows.map((r) => <CategoryPie key={r.category} r={r} />)}</div>}
                  table={<DataTable rows={rows} columns={[{ key: "category", label: s.title }, { key: "deceased_n", label: "Deceased", align: "right" }, { key: "alive_n", label: "Alive", align: "right" }, { key: "patients", label: "Patients", align: "right" }, { key: "mortality_pct", label: "Mortality %", align: "right", fmt: (v) => fmtNum(v) }, { key: "mortality_ci_low", label: "CI low", align: "right", fmt: (v) => fmtNum(v) }, { key: "mortality_ci_high", label: "CI high", align: "right", fmt: (v) => fmtNum(v) }]} />}
                />
              );
            })}
            <Note tone="warn">
              <b>Descriptive only, not "what prevents death".</b>
              <ul className="mt-1 list-disc pl-4">{d.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
              Signs come from the patient's monitoring alarms: sicker patients alarm more, so signs mostly reflect severity, not causes.
            </Note>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
