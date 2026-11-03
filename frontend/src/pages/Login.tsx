import { useState } from "react";
import { Activity, Code2, HeartPulse, Shield, Smartphone, Stethoscope, Wrench } from "lucide-react";
import { IDLE_MINUTES, useAuth } from "../lib/auth";
import { useApi } from "../lib/api";
import { Card, ErrorState } from "../components/ui";

const ICON = { nurse: HeartPulse, doctor: Stethoscope, admin: Shield, eng_lead: Wrench, engineer: Code2, patient: Smartphone } as const;
const CAN = {
  nurse: "View patients & alarms, acknowledge and resolve alarms, analytics.",
  doctor: "Patient history & trends, alarm review, analytics, audit log.",
  admin: "Simulator control, settings, audit log, analytics, engineering views (no alarm handling).",
  eng_lead: "Engineering Hub, lifecycle, knowledge review & restricted runbooks. No patient data.",
  engineer: "Engineering Hub, lifecycle, submit knowledge. No patient data, no restricted records.",
  patient: "Own record only, through the mobile app: trends, medications, daily check-in.",
} as const;
const GROUPS: { title: string; roles: string[] }[] = [
  { title: "B · Clinical portal (nurse & doctor)", roles: ["nurse", "doctor", "admin"] },
  { title: "C · Engineering leadership", roles: ["eng_lead", "engineer"] },
  { title: "A · Patient mobile app", roles: ["patient"] },
];

export default function Login() {
  const { login } = useAuth();
  const users = useApi<{ username: string; display_name: string; role: keyof typeof ICON; unit: string | null }[]>(["demo-users"], "/api/auth/users");  const [err, setErr] = useState<unknown>(null);
  const [idle] = useState(() => {
    const v = sessionStorage.getItem("cw_idle_logout") === "1";
    sessionStorage.removeItem("cw_idle_logout");
    return v;
  });

  return (
    <div className="flex min-h-full items-center justify-center bg-plane p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><Activity size={24} /></div>
          <div>
            <h1 className="text-2xl font-bold">CardioWatch AI</h1>
            <p className="text-sm text-ink-2">From Cardiac Monitoring Data to Better Clinical Awareness and Care-Team Coordination.</p>
          </div>
        </div>
        {idle && (
          <p role="status" className="mb-3 rounded-md border border-warn/60 bg-warn/10 px-3 py-2 text-xs">
            You were signed out after {IDLE_MINUTES} minutes of inactivity.
          </p>
        )}
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Choose a demo account</h2>
          <p className="mb-4 text-xs text-muted">Demo identity switcher — no passwords. Roles are enforced by the server on every request.</p>
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {users.data?.filter((u) => g.roles.includes(u.role)).map((u) => {
                  const Icon = ICON[u.role];
                  return (
                    <button key={u.username} onClick={() => login(u.username).catch(setErr)} className="flex items-start gap-3 rounded-lg border border-black/10 bg-white p-3 text-left hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand">
                      <Icon className="mt-0.5 text-brand" size={20} aria-hidden />
                      <div>
                        <div className="text-sm font-semibold">{u.display_name}</div>
                        <div className="text-xs text-ink-2">{u.role.replace("_", " ")}{u.unit ? ` · ${u.unit}` : ""}</div>
                        <div className="mt-1 text-[11px] text-muted">{CAN[u.role]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {users.error ? <ErrorState error={users.error} /> : null}
          {err ? <ErrorState error={err} /> : null}
        </Card>
        <p className="mt-4 text-center text-xs text-muted">All patients, staff and events are synthetic. This proof of concept is not a medical device and is not HIPAA compliant.</p>
      </div>
    </div>
  );
}
