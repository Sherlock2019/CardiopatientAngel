import { useMeta, presetRange, type AnalyticsFilters } from "../lib/meta";
import { Segmented, Select } from "./ui";

const PRESETS = [
  { value: "7", label: "7 d" },
  { value: "30", label: "30 d" },
  { value: "90", label: "90 d" },
];

export function FilterBar({ value, onChange, showTz = true }: { value: AnalyticsFilters & { preset?: string }; onChange: (v: AnalyticsFilters & { preset?: string }) => void; showTz?: boolean }) {
  const meta = useMeta();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-white px-4 py-2.5" role="group" aria-label="Analytics filters">
      <Segmented
        label="Date range"
        value={value.preset ?? "90"}
        onChange={(p) => onChange({ ...value, preset: p, ...presetRange(Number(p)) })}
        options={PRESETS}
      />
      <Select label="Care unit" value={value.unit?.[0] ?? ""} onChange={(e) => onChange({ ...value, unit: e.target.value ? [e.target.value] : [] })}>
        <option value="">All units</option>
        {meta.data?.care_units.map((u) => <option key={u}>{u}</option>)}
      </Select>
      {showTz && (
        <Select label="Timezone" value={value.tz ?? ""} onChange={(e) => onChange({ ...value, tz: e.target.value || undefined })}>
          <option value="">Hospital default</option>
          {meta.data?.timezones.map((t) => <option key={t}>{t}</option>)}
        </Select>
      )}
      <span className="ml-auto text-[11px] text-muted">Synthetic demonstration data · descriptive only</span>
    </div>
  );
}

export function toParams(f: AnalyticsFilters & { preset?: string }) {
  const { preset, ...rest } = f;
  void preset;
  return rest;
}
