/* Chart palette — validated reference palette (dataviz skill), light mode. */
import type { ReactNode } from "react";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
export const STATUS = { critical: "#d03b3b", warning: "#fab219", advisory: "#898781" };
export const OUTCOME = { alive: SERIES[0], deceased: SERIES[1] };
export const AXIS = { stroke: "#c3c2b7", tick: { fill: "#6f6d68", fontSize: 11 } };

/** Map a value in [0,max] onto the sequential blue ramp. */
export function seqColor(v: number | null | undefined, max: number): string {
  if (v === null || v === undefined || max <= 0) return "#f0efec";
  const i = Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 1)));
  return SEQ[i];
}
export const inkOn = (hex: string) => (SEQ.indexOf(hex) >= 7 ? "#ffffff" : "#0b0b0b");

export function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ borderTop: `2px ${i.dashed ? "dashed" : "solid"} ${i.color}` }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function SeqLegend({ max, label }: { max: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span>0</span>
      <div className="flex h-2 w-40 overflow-hidden rounded-sm">
        {SEQ.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <span className="tabular">{max.toFixed(max < 10 ? 1 : 0)}</span>
      <span>{label}</span>
    </div>
  );
}
