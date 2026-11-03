import { useApi } from "./api";
import type { Meta } from "./types";

export const useMeta = () => useApi<Meta>(["meta"], "/api/meta", undefined, { staleTime: Infinity });

export interface AnalyticsFilters {
  date_from?: string;
  date_to?: string;
  tz?: string;
  unit?: string[];
}

export function presetRange(days: number): { date_from: string; date_to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { date_from: iso(from), date_to: iso(to) };
}
