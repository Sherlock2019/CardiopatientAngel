import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandCenter from "../pages/CommandCenter";
import LiveAlarms from "../pages/LiveAlarms";
import { ALARM, OUTCOMES, SUMMARY, USER, mockFetch, renderPage } from "./utils";

const META = { care_units: ["Coronary Care Unit"], severities: ["critical", "warning", "advisory"], alarm_types: ["HR high"], age_groups: [], pathologies: [], dispositions: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("Command Center", () => {
  it("renders KPIs, the alarm queue and the outcome comparison", async () => {
    mockFetch({ "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/alarms": { items: [ALARM], total: 1 }, "/api/analytics/outcomes": OUTCOMES });
    renderPage(<CommandCenter />);
    expect((await screen.findAllByText("173")).length).toBeGreaterThan(0); // KPI panel + ward banner
    expect(screen.getByText("Monitored patients")).toBeInTheDocument();
    expect((await screen.findAllByText("Avery Lambert")).length).toBeGreaterThan(0); // monitor tile + queue row
    // Severity is conveyed by text, not colour alone
    expect(screen.getByText("Critical", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("152 bpm".split(" ")[0])).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "Deceased by category" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Discharged alive by category" })).toBeInTheDocument();
    expect(screen.getByText(/cannot show what prevents death/)).toBeInTheDocument();
  });

  it("switches the outcome comparison dimension", async () => {
    mockFetch({ "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/alarms": { items: [] }, "/api/analytics/outcomes": OUTCOMES });
    renderPage(<CommandCenter />);
    const deceased = await screen.findByRole("table", { name: "Deceased by category" });
    expect(within(deceased).getByText("80-89")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Disease" }));
    expect(within(screen.getByRole("table", { name: "Deceased by category" })).getByText("Heart failure")).toBeInTheDocument();
  });

  it("shows an empty state when there are no active alarms", async () => {
    mockFetch({ "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/alarms": { items: [] }, "/api/analytics/outcomes": OUTCOMES });
    renderPage(<CommandCenter />);
    expect(await screen.findByText("No alarms match the current filters.")).toBeInTheDocument();
  });

  it("shows loading and then an error state when the API fails", async () => {
    mockFetch({
      "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/analytics/outcomes": OUTCOMES,
      "/api/alarms": () => new Response(JSON.stringify({ detail: "Internal server error" }), { status: 500 }),
    });
    renderPage(<CommandCenter />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Internal server error")).length).toBeGreaterThan(0);
  });

  it("drills down from an alarm to the patient", async () => {
    mockFetch({ "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/alarms": { items: [ALARM] }, "/api/analytics/outcomes": OUTCOMES });
    renderPage(<CommandCenter />);
    await userEvent.click(await screen.findByRole("link", { name: "Avery Lambert" }));
    expect(await screen.findByText("Patient page stub")).toBeInTheDocument();
  });

  it("expands the demo attention indicator factors", async () => {
    mockFetch({ "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/alarms": { items: [ALARM] }, "/api/analytics/outcomes": OUTCOMES });
    renderPage(<CommandCenter />);
    await userEvent.click(await screen.findByRole("button", { name: "Show attention factors for alarm 501" }));
    expect(screen.getByText("Highest unresolved alarm severity")).toBeInTheDocument();
    expect(screen.getAllByText(/Demo Only/).length).toBeGreaterThan(0);
  });

  it("acknowledges an alarm via the API", async () => {
    const spy = mockFetch({
      "/api/auth/me": USER, "/api/dashboard/summary": SUMMARY, "/api/analytics/outcomes": OUTCOMES,
      "/api/alarms/501/acknowledge": { ...ALARM, acknowledged_at: new Date().toISOString() },
      "/api/alarms": { items: [ALARM] },
    });
    renderPage(<CommandCenter />);
    await userEvent.click(await screen.findByRole("button", { name: "Acknowledge alarm 501" }));
    await waitFor(() => expect(spy.mock.calls.some(([u, i]) => String(u).includes("/api/alarms/501/acknowledge") && i?.method === "POST")).toBe(true));
  });
});

describe("Live Alarms filters", () => {
  it("sends the selected severity and status to the API", async () => {
    const spy = mockFetch({ "/api/auth/me": USER, "/api/meta": META, "/api/alarms": { items: [ALARM], total: 1 } });
    renderPage(<LiveAlarms />);
    await screen.findByText("Avery Lambert");
    await userEvent.selectOptions(screen.getByLabelText("Severity"), "critical");
    await userEvent.click(screen.getByRole("radio", { name: "Unacknowledged" }));
    await waitFor(() => {
      const urls = spy.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/api/alarms"));
      expect(urls.some((u) => u.includes("severity=critical") && u.includes("status=unacknowledged"))).toBe(true);
    });
  });
});
