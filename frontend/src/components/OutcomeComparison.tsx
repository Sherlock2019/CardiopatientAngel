import { useMemo, useState } from "react";
import { HeartCrack, HeartPulse } from "lucide-react";
import { useApi } from "../lib/api";
import { fmtNum } from "../lib/format";
import type { OutcomeGroup, OutcomeRow, Outcomes } from "../lib/types";
import { OUTCOME } from "./charts";
import { Card, CardHeader, Note, QueryBoundary, Segmented, Badge } from "./ui";

function GroupTable({ title, icon, color, rows, side, total }: { title: string; icon: React.ReactNode; color: string; rows: OutcomeRow[]; side: "deceased" | "alive"; total: number }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.deceased_pct, r.alive_pct)));
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white">
      <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} aria-hidden />
          {icon} {title}
        </div>
        <span className="tabular text-xs text-muted">n = {total.toLocaleString()}</span>
      </div>
      <table className="w-full text-xs" aria-label={`${title} by category`}>
        <thead>
          <tr className="text-left text-ink-2">
            <th className="px-3 py-1.5 font-medium">Category</th>
            <th className="px-2 py-1.5 text-right font-medium">Patients</th>
            <th className="w-[45%] px-3 py-1.5 font-medium">% of {side === "deceased" ? "deceased" : "survivors"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const n = side === "deceased" ? r.deceased_n : r.alive_n;
            const pct = side === "deceased" ? r.deceased_pct : r.alive_pct;
            return (
              <tr key={r.category} className="border-t border-black/5">
                <td className="px-3 py-1.5">
                  {r.category}
                  {r.small_cohort && <Badge className="ml-1 border-warn/60 bg-warn/10 text-ink">small n</Badge>}
                </td>
                <td className="tabular px-2 py-1.5 text-right">{n}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-sm bg-black/[0.04]">
                      <div className="h-2.5 rounded-r-[4px]" style={{ width: `${(pct / max) * 100}%`, background: color }} />
                    </div>
                    <span className="tabular w-11 text-right font-medium">{fmtNum(pct)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryStrip({ dec, alive }: { dec: OutcomeGroup; alive: OutcomeGroup }) {
  const items: [string, keyof OutcomeGroup, string][] = [
    ["Median age", "median_age", "y"],
    ["Median length of stay", "median_los_days", " d"],
    ["Median alarms / day", "median_alarms_per_day", ""],
    ["Mean critical alarms", "mean_critical_alarms", ""],
    ["Female", "pct_female", "%"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map(([label, k, unit]) => (
        <div key={k} className="rounded-lg border border-black/10 bg-white px-3 py-2">
          <div className="text-[11px] text-muted">{label}</div>
          <div className="tabular mt-0.5 flex items-baseline gap-3 text-sm">
            <span title="Deceased"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: OUTCOME.deceased }} />{fmtNum(dec[k] as number)}{unit}</span>
            <span title="Survivors"><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: OUTCOME.alive }} />{fmtNum(alive[k] as number)}{unit}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OutcomeComparison({ unit }: { unit?: string }) {
  const q = useApi<Outcomes & { window: { from: string; to: string } }>(["outcomes"], "/api/analytics/outcomes", { unit: unit ? [unit] : [] });
  const [dim, setDim] = useState("Age group");
  const data = q.data;
  const rows = useMemo(() => data?.dimensions.find((d) => d.dimension === dim)?.rows ?? [], [data, dim]);
  const topDiffs = useMemo(() => {
    if (!data) return [];
    return data.dimensions
      .filter((d) => d.dimension !== "Sex")
      .flatMap((d) => d.rows.filter((r) => !r.small_cohort).map((r) => ({ ...r, dimension: d.dimension })))
      .sort((a, b) => Math.abs(b.difference_pp) - Math.abs(a.difference_pp))
      .slice(0, 6);
  }, [data]);

  return (
    <Card>
      <CardHeader
        title="Outcomes: deceased vs. discharged alive"
        subtitle="Completed stays in the last 90 days. Each table shows how the group is composed by the selected dimension."
        right={
          data && (
            <span className="tabular text-xs text-ink-2">
              In-hospital mortality <b>{fmtNum(data.mortality_pct)}%</b> (95% CI {fmtNum(data.mortality_ci_low)}–{fmtNum(data.mortality_ci_high)}) · {data.completed_stays} stays
            </span>
          )
        }
      />
      <QueryBoundary q={q}>
        {(d) => (
          <div className="space-y-4 p-4">
            <SummaryStrip dec={d.deceased} alive={d.alive} />
            <Segmented label="Comparison dimension" value={dim} onChange={setDim} options={d.dimensions.map((x) => ({ value: x.dimension, label: x.dimension }))} />
            <div className="flex flex-col gap-3 lg:flex-row">
              <GroupTable title="Deceased" icon={<HeartCrack size={14} aria-hidden />} color={OUTCOME.deceased} rows={rows} side="deceased" total={d.deceased.patients} />
              <GroupTable title="Discharged alive" icon={<HeartPulse size={14} aria-hidden />} color={OUTCOME.alive} rows={rows} side="alive" total={d.alive.patients} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-black/10 bg-white p-3">
                <h3 className="mb-2 text-xs font-semibold">Mortality by {dim.toLowerCase()} (95% CI)</h3>
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.category} className="border-t border-black/5">
                        <td className="py-1 pr-2">{r.category}</td>
                        <td className="tabular py-1 text-right text-muted">n={r.patients}</td>
                        <td className="w-1/2 py-1 pl-3">
                          <div className="relative h-3" aria-label={`${fmtNum(r.mortality_pct)}% (CI ${fmtNum(r.mortality_ci_low)}–${fmtNum(r.mortality_ci_high)})`}>
                            {r.mortality_ci_low !== null && (
                              <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-axis" style={{ left: `${r.mortality_ci_low}%`, width: `${(r.mortality_ci_high ?? 0) - r.mortality_ci_low}%` }} />
                            )}
                            {r.mortality_pct !== null && <div className="absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white" style={{ left: `${r.mortality_pct}%`, background: OUTCOME.deceased }} />}
                          </div>
                        </td>
                        <td className="tabular w-12 py-1 text-right font-medium">{fmtNum(r.mortality_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-muted">Axis 0–100%. Wide intervals = little information.</p>
              </div>
              <div className="rounded-lg border border-black/10 bg-white p-3">
                <h3 className="mb-2 text-xs font-semibold">Where the two groups differ most (all dimensions)</h3>
                <ul className="space-y-1.5 text-xs">
                  {topDiffs.map((r) => (
                    <li key={r.dimension + r.category} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="text-muted">{r.dimension}:</span> <b>{r.category}</b>{" "}
                        {r.difference_pp > 0 ? "more common among survivors" : "more common among deceased"}
                      </span>
                      <span className="tabular shrink-0 font-medium">{r.difference_pp > 0 ? "+" : "−"}{fmtNum(Math.abs(r.difference_pp))} pts</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted">Percentage-point gap between the share of survivors and the share of deceased patients in each category.</p>
              </div>
            </div>
            <Note tone="warn">
              <b>Read as description, not as “what prevents death”.</b>
              <ul className="mt-1 list-disc pl-4">
                {d.caveats.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </Note>
          </div>
        )}
      </QueryBoundary>
    </Card>
  );
}
