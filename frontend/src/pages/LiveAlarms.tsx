import { useState } from "react";
import { useApi } from "../lib/api";
import { useMeta } from "../lib/meta";
import { useLive } from "../lib/live";
import type { Alarm } from "../lib/types";
import { AlarmTable } from "../components/AlarmTable";
import { Card, CardHeader, QueryBoundary, Select, Segmented } from "../components/ui";

export default function LiveAlarms() {
  const meta = useMeta();
  const { events } = useLive();
  const [status, setStatus] = useState("active");
  const [severity, setSeverity] = useState("");
  const [unit, setUnit] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const q = useApi<{ items: Alarm[]; total: number }>(["alarms", "live"], "/api/alarms", {
    status, severity: severity ? [severity] : [], unit: unit ? [unit] : [], alarm_type: type ? [type] : [],
    search, hours: status === "resolved" || status === "all" ? 24 : undefined, limit: 300, sort: "priority",
  }, { refetchInterval: 20_000 });
  const newCount = events.filter((e) => e.event === "alarm" && Date.now() - e.received < 60_000).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-bold">Live Alarms</h1>
        <span className="text-xs text-muted" aria-live="polite">{newCount ? `${newCount} new alarm(s) in the last minute` : "Updates automatically"}</span>
      </div>
      <Card>
        <CardHeader
          title={`Alarm queue${q.data ? ` · ${q.data.total}` : ""}`}
          right={
            <>
              <Segmented label="Status" value={status} onChange={setStatus} options={[
                { value: "active", label: "Active" }, { value: "unacknowledged", label: "Unacknowledged" },
                { value: "acknowledged", label: "Acknowledged" }, { value: "resolved", label: "Resolved 24 h" }, { value: "all", label: "All 24 h" },
              ]} />
              <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="">All</option>{meta.data?.severities.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">All units</option>{meta.data?.care_units.map((u) => <option key={u}>{u}</option>)}
              </Select>
              <Select label="Type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All</option>{meta.data?.alarm_types.map((u) => <option key={u}>{u}</option>)}
              </Select>
              <input aria-label="Search patient" placeholder="Patient name / ID" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40 rounded-md border border-black/15 bg-white px-2 text-xs" />
            </>
          }
        />
        <QueryBoundary q={q}>{(d) => <AlarmTable alarms={d.items} />}</QueryBoundary>
      </Card>
    </div>
  );
}
