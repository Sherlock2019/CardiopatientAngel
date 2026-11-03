import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import { AuthProvider } from "../lib/auth";

export const USER = {
  username: "nurse.moreau", display_name: "RN A. Moreau", role: "nurse", unit: "Coronary Care Unit",
  permissions: ["acknowledge_alarm", "review_alarm", "view_analytics", "view_clinical"],
};

type Handler = (url: URL, init?: RequestInit) => unknown | Response;

/** Route-table fetch mock: first matching path prefix wins. Returns the spy for assertions. */
export function mockFetch(routes: Record<string, unknown | Handler>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.pathname.startsWith(k));
    if (!key) return new Response(JSON.stringify({ detail: `unmocked ${url.pathname}` }), { status: 404 });
    const v = routes[key];
    const body = typeof v === "function" ? (v as Handler)(url, init) : v;
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

export function renderPage(ui: ReactElement, { route = "/", path = "/" } = {}) {
  sessionStorage.setItem("cw_token", "test-token");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/patients/:id" element={<div>Patient page stub</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const ALARM = {
  alarm_id: 501, patient_id: "P00042", alarm_type: "HR high", severity: "critical", trigger_value: 152.4, trigger_unit: "bpm",
  triggered_at: new Date(Date.now() - 12 * 60000).toISOString(), acknowledged_at: null, acknowledged_by: null, resolved_at: null,
  assigned_nurse: "RN A. Moreau", clinical_review_status: "new", source: "seed-history", synthetic_name: "Avery Lambert",
  age: 81, care_unit: "Coronary Care Unit", diagnoses: ["Heart failure"],
  current_measurement: { measurement_type: "heart_rate", value: 118, unit: "bpm", observed_at: new Date().toISOString() },
  minutes_unacknowledged: 12,
  attention: { label: "Operational Attention Indicator — Demo Only", score: 72, factors: [
    { factor: "Highest unresolved alarm severity", value: "critical", points: 40 },
    { factor: "Alarms in last 6 h", value: 2, points: 10 },
    { factor: "Minutes oldest alarm unacknowledged", value: 12, points: 12 },
    { factor: "Repeat alarms (same type within 120 min)", value: 2, points: 10 },
  ] },
};

const row = (category: string, d: number, a: number) => ({
  category, deceased_n: d, deceased_pct: d * 10, alive_n: a, alive_pct: a, difference_pp: a - d * 10, patients: d + a,
  mortality_pct: (d / (d + a)) * 100, mortality_ci_low: 1, mortality_ci_high: 20, small_cohort: false,
});

export const OUTCOMES = {
  window: { from: "", to: "" }, completed_stays: 110, mortality_pct: 9.1, mortality_ci_low: 5, mortality_ci_high: 16,
  deceased: { patients: 10, median_age: 84, median_los_days: 6.1, median_alarms_per_day: 2.1, mean_critical_alarms: 2.4, pct_female: 50 },
  alive: { patients: 100, median_age: 71, median_los_days: 4.2, median_alarms_per_day: 1.2, mean_critical_alarms: 0.6, pct_female: 48 },
  dimensions: [
    { dimension: "Age group", rows: [row("<50", 0, 12), row("80-89", 6, 20)] },
    { dimension: "Disease", rows: [row("Heart failure", 7, 25), row("Hypertension", 3, 50)] },
  ],
  caveats: ["Descriptive comparison only. It cannot show what prevents death."],
};

export const SUMMARY = {
  as_of: new Date().toISOString(), monitored_patients: 173, active_alarms: 25, unacknowledged_alarms: 10,
  critical_active_alarms: 2, patients_with_repeated_alarms_24h: 36, median_ack_minutes_24h: 3.6, alarms_24h: 228,
  active_by_severity: { critical: 2, warning: 13, advisory: 10 }, active_by_unit: { "Coronary Care Unit": 8 },
  hourly_24h: [{ hour: new Date().toISOString(), alarms: 4 }], total_patients: 1000, total_alarms: 7000,
};
