let displayTz = "America/New_York";
export const setDisplayTz = (tz: string) => (displayTz = tz);
export const getDisplayTz = () => displayTz;

export function fmtTime(iso?: string | null, withDate = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    timeZone: displayTz,
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: displayTz, year: "numeric", month: "short", day: "numeric" });
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  if (m < 1) return `${Math.round(m * 60)} s`;
  if (m < 90) return `${m.toFixed(1)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export function ago(iso: string): string {
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  if (mins < 48 * 60) return `${(mins / 60).toFixed(1)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

export const MEAS_LABEL: Record<string, string> = {
  heart_rate: "HR",
  systolic_bp: "SBP",
  diastolic_bp: "DBP",
  spo2: "SpO₂",
};
