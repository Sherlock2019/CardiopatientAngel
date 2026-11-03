import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Cross, Home, UserPlus } from "lucide-react";
import { useApi } from "../lib/api";
import { Card, CardHeader, QueryBoundary, cn } from "./ui";

type Kind = "admitted" | "discharged_alive" | "deceased";
interface PatientRef { patient_id: string; synthetic_name: string; care_unit: string }
interface CalDay { date: string; admitted: PatientRef[]; discharged_alive: PatientRef[]; deceased: PatientRef[]; counts: Record<Kind, number> }
interface Cal { month: string; today: string; totals: Record<Kind, number>; days: CalDay[] }

// Same hues as the Outcomes dashboard: deceased orange, discharged alive blue; admissions get teal.
const KINDS: { key: Kind; label: string; color: string; Icon: typeof UserPlus }[] = [
  { key: "admitted", label: "New patients", color: "#0f9488", Icon: UserPlus },
  { key: "discharged_alive", label: "Released alive", color: "#2a78d6", Icon: Home },
  { key: "deceased", label: "Deceased", color: "#eb6834", Icon: Cross },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function PatientCalendar() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [picked, setPicked] = useState<string | null>(null);
  const q = useApi<Cal>(["calendar", month ?? "now"], "/api/dashboard/calendar", month ? { month } : undefined, { refetchInterval: 60_000 });

  return (
    <Card>
      <QueryBoundary q={q}>
        {(c) => {
          const [y, m] = c.month.split("-").map(Number);
          const first = new Date(Date.UTC(y, m - 1, 1));
          const lead = (first.getUTCDay() + 6) % 7; // Monday-first grid
          const nDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const byDate = new Map(c.days.map((d) => [d.date, d]));
          const cells = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => `${c.month}-${String(i + 1).padStart(2, "0")}`)];
          const sel = picked && byDate.get(picked);
          const title = first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
          return (
            <>
              <CardHeader
                title="Patient calendar"
                subtitle="New admissions, patients released alive and deaths per day (UTC dates). Click a day for the list."
                right={
                  <div className="flex items-center gap-1">
                    <button className="rounded p-1 hover:bg-black/5" aria-label="Previous month" onClick={() => { setMonth(shift(c.month, -1)); setPicked(null); }}><ChevronLeft size={16} /></button>
                    <span className="w-32 text-center text-sm font-semibold">{title}</span>
                    <button className="rounded p-1 hover:bg-black/5 disabled:opacity-30" aria-label="Next month" disabled={c.month >= c.today.slice(0, 7)} onClick={() => { setMonth(shift(c.month, 1)); setPicked(null); }}><ChevronRight size={16} /></button>
                  </div>
                }
              />
              <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
                <div>
                  <div className="mb-3 flex flex-wrap gap-3 text-xs">
                    {KINDS.map(({ key, label, color, Icon }) => (
                      <span key={key} className="flex items-center gap-1.5 text-ink-2">
                        <Icon size={13} style={{ color }} aria-hidden /> {label} <b className="tabular text-ink">{c.totals[key]}</b>
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-[11px]" role="grid" aria-label={`Patient calendar ${title}`}>
                    {WEEKDAYS.map((w) => <div key={w} className="pb-1 text-center font-medium text-muted">{w}</div>)}
                    {cells.map((date, i) => {
                      if (!date) return <div key={`x${i}`} />;
                      const d = byDate.get(date);
                      const isToday = date === c.today;
                      const future = date > c.today;
                      return (
                        <button
                          key={date}
                          disabled={!d}
                          onClick={() => setPicked(date)}
                          className={cn(
                            "min-h-16 rounded-md border p-1 text-left transition",
                            d ? "border-black/10 bg-white hover:border-brand/50 hover:shadow-sm" : "border-transparent bg-black/[0.02]",
                            future && "opacity-40",
                            picked === date && "ring-2 ring-brand",
                            isToday && "border-brand",
                          )}
                          aria-label={`${date}: ${d ? KINDS.map((k) => `${d.counts[k.key]} ${k.label.toLowerCase()}`).join(", ") : "no events"}`}
                        >
                          <div className={cn("text-[11px] font-semibold", isToday ? "text-brand-dark" : "text-ink-2")}>{Number(date.slice(8))}</div>
                          {d && (
                            <div className="mt-0.5 space-y-0.5">
                              {KINDS.filter((k) => d.counts[k.key] > 0).map(({ key, color, Icon }) => (
                                <div key={key} className="flex items-center gap-1 tabular font-semibold" style={{ color }}>
                                  <Icon size={10} aria-hidden /> {d.counts[key]}
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-lg border border-black/10 bg-plane/60 p-3 text-xs">
                  {!sel ? (
                    <p className="text-muted">Pick a day to see who was admitted, released or died.</p>
                  ) : (
                    <>
                      <div className="mb-2 text-sm font-semibold">{new Date(`${picked}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</div>
                      {KINDS.map(({ key, label, color, Icon }) => sel[key].length > 0 && (
                        <div key={key} className="mb-2.5">
                          <div className="mb-1 flex items-center gap-1 font-semibold" style={{ color }}><Icon size={12} aria-hidden /> {label} ({sel[key].length})</div>
                          <ul className="space-y-0.5">
                            {sel[key].map((p) => (
                              <li key={p.patient_id}>
                                <Link to={`/patients/${p.patient_id}`} className="hover:underline">{p.synthetic_name}</Link>
                                <span className="text-muted"> · {p.care_unit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </Card>
  );
}
