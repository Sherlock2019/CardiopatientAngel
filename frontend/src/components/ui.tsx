/* Small shadcn-style primitives (Tailwind + cn), kept local to avoid a generator step. */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertOctagon, AlertTriangle, Info, Loader2, ShieldAlert, Table2, BarChart3 } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import type { Severity } from "../lib/types";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-black/10 bg-surface shadow-sm", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-brand text-white hover:bg-brand-dark",
        variant === "secondary" && "border border-black/15 bg-white text-ink hover:bg-brand-soft",
        variant === "ghost" && "text-ink-2 hover:bg-black/5",
        variant === "danger" && "bg-crit text-white hover:opacity-90",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      {label && <span>{label}</span>}
      <select
        className={cn("h-8 rounded-md border border-black/15 bg-white px-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-brand", className)}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-black/15 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium",
            value === o.value ? "bg-brand text-white" : "text-ink-2 hover:bg-brand-soft",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

const SEV = {
  critical: { icon: AlertOctagon, cls: "bg-crit text-white border-crit", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "bg-warn text-ink border-warn", label: "Warning" },
  advisory: { icon: Info, cls: "bg-white text-ink-2 border-black/25", label: "Advisory" },
} as const;

/** Severity is never color alone: icon + text label + color. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  const Icon = s.icon;
  return (
    <span className={cn("sev-chip inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold", s.cls)}>
      <Icon size={12} aria-hidden /> {s.label}
    </span>
  );
}

export function StatusBadge({ status, acknowledged, resolved }: { status: string; acknowledged: boolean; resolved: boolean }) {
  if (!acknowledged) return <Badge className="border-crit/40 bg-crit/5 text-crit">● Unacknowledged</Badge>;
  if (!resolved) return <Badge className="border-brand/40 bg-brand-soft text-brand-dark">◐ Acknowledged</Badge>;
  return <Badge className="border-black/15 bg-black/[0.03] text-ink-2">✓ {status === "reviewed" ? "Reviewed" : "Resolved"}</Badge>;
}

export function Stat({ label, value, hint, tone, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "crit" | "warn" | "brand"; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold", tone === "crit" && "text-crit", tone === "brand" && "text-brand-dark")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-muted">
      <Loader2 className="animate-spin" size={16} aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="m-4 flex items-center gap-2 rounded-md border border-crit/30 bg-crit/5 p-3 text-sm text-crit">
      <ShieldAlert size={16} aria-hidden /> {error instanceof Error ? error.message : "Something went wrong"}
    </div>
  );
}

export function Empty({ children = "No data for the current filters." }: { children?: ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted">{children}</div>;
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs", tone === "warn" ? "border-warn/60 bg-warn/10 text-ink" : "border-brand/20 bg-brand-soft text-ink-2")}>
      {tone === "warn" ? <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden /> : <Info size={14} className="mt-px shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

export function QueryBoundary<T>({ q, children, empty }: { q: { isLoading: boolean; error: unknown; data?: T }; children: (d: T) => ReactNode; empty?: (d: T) => boolean }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  if (q.data === undefined) return <Empty />;
  if (empty && empty(q.data)) return <Empty />;
  return <>{children(q.data)}</>;
}

/** Chart card with a built-in table view (accessibility + exact values). */
export function ChartCard({ title, subtitle, controls, chart, table, footer }: { title: string; subtitle?: ReactNode; controls?: ReactNode; chart: ReactNode; table?: ReactNode; footer?: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        right={
          <>
            {controls}
            {table && (
              <Button size="sm" variant="ghost" onClick={() => setView(view === "chart" ? "table" : "chart")} aria-label={view === "chart" ? `Show ${title} as table` : `Show ${title} as chart`}>
                {view === "chart" ? <Table2 size={14} /> : <BarChart3 size={14} />}
                {view === "chart" ? "Table" : "Chart"}
              </Button>
            )}
          </>
        }
      />
      <div className="p-4">{view === "chart" ? chart : <div className="max-h-96 overflow-auto">{table}</div>}</div>
      {footer && <div className="border-t border-black/5 px-4 py-2.5">{footer}</div>}
    </Card>
  );
}

export function DataTable({ columns, rows }: { columns: { key: string; label: string; fmt?: (v: any, row: any) => ReactNode; align?: "right" }[]; rows: any[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface">
        <tr className="border-b border-black/10 text-left text-ink-2">
          {columns.map((c) => (
            <th key={c.key} className={cn("px-2 py-1.5 font-medium", c.align === "right" && "text-right")}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-black/5">
            {columns.map((c) => (
              <td key={c.key} className={cn("px-2 py-1.5", c.align === "right" && "text-right tabular")}>{c.fmt ? c.fmt(r[c.key], r) : r[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
