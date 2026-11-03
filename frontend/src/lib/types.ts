export type Severity = "critical" | "warning" | "advisory";

export interface User {
  username: string;
  display_name: string;
  role: "nurse" | "doctor" | "admin" | "eng_lead" | "engineer" | "patient";
  patient_id?: string | null;
  unit: string | null;
  permissions: string[];
}

export interface Meta {
  disclaimer: string;
  age_groups: string[];
  pathologies: string[];
  medication_classes: string[];
  treatments: string[];
  care_units: string[];
  alarm_types: string[];
  severities: Severity[];
  dispositions: string[];
  timezones: string[];
  shifts: { name: string; start_hour: number; end_hour: number }[];
  injected_patterns: string[];
  injected_outcome_patterns: string[];
  device_types: string[];
  device_info: Record<string, { model: string; connectivity: string; signals: string[]; alarms: string[]; offline_after_min: number }>;
  technical_alarms: string[];
  mobile_port: number;
}

export interface AttentionFactor {
  factor: string;
  value: string | number;
  points: number;
}
export interface Attention {
  label: string;
  score: number;
  factors: AttentionFactor[];
}

export interface Alarm {
  alarm_id: number;
  patient_id: string;
  alarm_type: string;
  severity: Severity;
  trigger_value: number | null;
  trigger_unit: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  assigned_nurse: string;
  clinical_review_status: string;
  source: string;
  synthetic_name?: string;
  age?: number;
  care_unit?: string;
  diagnoses?: string[];
  current_measurement?: { measurement_type: string; value: number; unit: string; observed_at: string } | null;
  minutes_unacknowledged?: number | null;
  attention?: Attention | null;
}

export interface Summary {
  as_of: string;
  monitored_patients: number;
  active_alarms: number;
  unacknowledged_alarms: number;
  critical_active_alarms: number;
  patients_with_repeated_alarms_24h: number;
  median_ack_minutes_24h: number | null;
  alarms_24h: number;
  active_by_severity: Record<Severity, number>;
  active_by_unit: Record<string, number>;
  hourly_24h: { hour: string; alarms: number }[];
  total_patients: number;
  total_alarms: number;
}

export interface RateRow {
  key?: string;
  age_group?: string;
  patients: number;
  exposure_days: number;
  alarms: number;
  critical: number;
  rate_per_100_patient_days: number | null;
  critical_rate_per_100_patient_days: number | null;
  pct_patients_with_alarm: number | null;
  repeat_pct: number | null;
  median_ack_min: number | null;
  small_cohort: boolean;
  suppressed: boolean;
}

export interface OutcomeRow {
  category: string;
  deceased_n: number;
  deceased_pct: number;
  alive_n: number;
  alive_pct: number;
  difference_pp: number;
  patients: number;
  mortality_pct: number | null;
  mortality_ci_low: number | null;
  mortality_ci_high: number | null;
  small_cohort: boolean;
}

export interface OutcomeGroup {
  patients: number;
  median_age: number | null;
  median_los_days: number | null;
  median_alarms_per_day: number | null;
  mean_critical_alarms: number | null;
  pct_female: number | null;
}

export interface Outcomes {
  completed_stays: number;
  mortality_pct: number | null;
  mortality_ci_low: number | null;
  mortality_ci_high: number | null;
  deceased: OutcomeGroup;
  alive: OutcomeGroup;
  dimensions: { dimension: string; rows: OutcomeRow[] }[];
  caveats: string[];
}
