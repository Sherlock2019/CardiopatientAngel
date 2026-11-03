import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Activity, BellRing, BookOpen, Cpu, FlaskConical, GitBranch, LayoutDashboard, LogOut, Settings as Cog, Users, UsersRound, BarChart3, Radio, Watch, Wrench } from "lucide-react";
import Devices from "./pages/Devices";
import EngineeringHub from "./pages/EngineeringHub";
import Lifecycle from "./pages/Lifecycle";
import KnowledgeHub from "./pages/KnowledgeHub";
import { useAuth } from "./lib/auth";
import { LiveProvider, useLive } from "./lib/live";
import { useApi } from "./lib/api";
import { useMeta } from "./lib/meta";
import { setDisplayTz } from "./lib/format";
import { Loading, cn } from "./components/ui";
import Login from "./pages/Login";
import CommandCenter from "./pages/CommandCenter";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import LiveAlarms from "./pages/LiveAlarms";
import RiskAnalytics from "./pages/RiskAnalytics";
import CohortExplorer from "./pages/CohortExplorer";
import Staffing from "./pages/Staffing";
import Simulator from "./pages/Simulator";
import Settings from "./pages/Settings";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard, perm: "view_clinical", group: "Clinical operations" },
  { to: "/patients", label: "Patients", icon: Users, perm: "view_clinical", group: "Clinical operations" },
  { to: "/alarms", label: "Live Alarms", icon: BellRing, perm: "view_clinical", group: "Clinical operations" },
  { to: "/analytics", label: "Risk Analytics", icon: BarChart3, perm: "view_analytics", group: "Clinical operations" },
  { to: "/cohorts", label: "Cohort Explorer", icon: FlaskConical, perm: "view_analytics", group: "Clinical operations" },
  { to: "/staffing", label: "Staffing Insights", icon: UsersRound, perm: "view_analytics", group: "Clinical operations" },
  { to: "/devices", label: "Devices & Integrations", icon: Watch, perm: "view_clinical", group: "Clinical operations" },
  { to: "/simulator", label: "Data Simulator", icon: Cpu, perm: "view_clinical", group: "Clinical operations" },
  { to: "/engineering", label: "Engineering Hub", icon: Wrench, perm: "view_engineering", group: "Engineering leadership" },
  { to: "/lifecycle", label: "Engineering Lifecycle", icon: GitBranch, perm: "view_engineering", group: "Engineering leadership" },
  { to: "/knowledge", label: "Knowledge Hub", icon: BookOpen, perm: "view_knowledge", group: "Engineering leadership" },
  { to: "/settings", label: "Settings", icon: Cog, perm: "view_clinical", group: "Clinical operations" },
];

function Home() {
  const { can } = useAuth();
  if (can("view_clinical")) return <CommandCenter />;
  if (can("view_engineering")) return <Navigate to="/engineering" replace />;
  return <PatientLanding />;
}

function PatientLanding() {
  const meta = useMeta();
  const mobile = `${location.protocol}//${location.hostname}:${meta.data?.mobile_port ?? 8081}`;
  return (
    <div className="mx-auto max-w-lg space-y-3 py-10 text-center">
      <h1 className="text-xl font-bold">Patient accounts use the mobile app</h1>
      <p className="text-sm text-ink-2">The clinical portal is for care teams. Open the CardioWatch patient app to see your trends and submit today's check-in.</p>
      <a className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-white" href={mobile}>Open the patient app</a>
    </div>
  );
}

function LiveDot() {
  const { connected } = useLive();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" title={connected ? "Live alarm stream connected" : "Live stream disconnected"}>
      <Radio size={14} className={connected ? "text-good" : "text-muted"} aria-hidden />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function Shell() {
  const { user, logout, can } = useAuth();
  const nav = NAV.filter((n) => can(n.perm));
  const settings = useApi<{ display_timezone: string }>(["settings"], "/api/settings");
  useEffect(() => {
    if (settings.data) setDisplayTz(settings.data.display_timezone);
  }, [settings.data]);

  return (
    <div className="flex h-full flex-col">
      <div role="note" className="bg-ink px-4 py-1 text-center text-[11px] font-medium tracking-wide text-white">
        SYNTHETIC DATA · DEMONSTRATION ONLY · NOT A MEDICAL DEVICE · NOT FOR CLINICAL DECISIONS
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-black/10 bg-white md:flex">
          <div className="flex items-center gap-2 px-4 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white"><Activity size={18} aria-hidden /></div>
            <div>
              <div className="text-sm font-bold leading-tight">CardioWatch AI</div>
              <div className="text-[10px] leading-tight text-muted">Cardiology monitoring</div>
            </div>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {["Clinical operations", "Engineering leadership"].map((group) => {
              const items = nav.filter((n) => n.group === group);
              if (!items.length) return null;
              return (
                <div key={group} className="pb-2">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted">{group}</div>
                  {items.map(({ to, label, icon: Icon }) => (
                    <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => cn("flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm", isActive ? "bg-brand-soft font-semibold text-brand-dark" : "text-ink-2 hover:bg-black/5")}>
                      <Icon size={16} aria-hidden /> {label}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="border-t border-black/10 p-3 text-xs">
            <div className="font-medium">{user?.display_name}</div>
            <div className="capitalize text-muted">{user?.role}{user?.unit ? ` · ${user.unit}` : ""}</div>
            <button onClick={logout} className="mt-2 inline-flex items-center gap-1 text-brand-dark hover:underline"><LogOut size={12} /> Switch user</button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-white px-4 py-2 md:px-6">
            <nav aria-label="Main (compact)" className="flex gap-1 overflow-x-auto md:hidden">
              {nav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === "/"} aria-label={label} className={({ isActive }) => cn("rounded p-2", isActive ? "bg-brand-soft text-brand-dark" : "text-ink-2")}><Icon size={16} /></NavLink>
              ))}
            </nav>
            <p className="hidden truncate text-xs text-muted md:block">From Cardiac Monitoring Data to Better Clinical Awareness and Care-Team Coordination.</p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted">Times in {settings.data?.display_timezone ?? "…"}</span>
              {can("view_clinical") && <LiveDot />}
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/engineering" element={<EngineeringHub />} />
              <Route path="/lifecycle" element={<Lifecycle />} />
              <Route path="/knowledge" element={<KnowledgeHub />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/patients/:id" element={<PatientDetail />} />
              <Route path="/alarms" element={<LiveAlarms />} />
              <Route path="/analytics" element={<RiskAnalytics />} />
              <Route path="/cohorts" element={<CohortExplorer />} />
              <Route path="/staffing" element={<Staffing />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/simulator" element={<Simulator />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Restoring session…" />;
  if (!user) return <Login />;
  return (
    <LiveProvider enabled={!!user && user.permissions.includes("view_clinical")}>
      <Shell />
    </LiveProvider>
  );
}
