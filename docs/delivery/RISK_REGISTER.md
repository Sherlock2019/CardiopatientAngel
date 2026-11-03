# Risk register (ISO 14971 style)

Starting point for the risk management file. Severity (S) and probability (P) on 1–5 scales; risk = S × P
(≥ 12 unacceptable, 6–11 reduce as far as possible, ≤ 5 acceptable). Values are engineering estimates to be
reviewed with clinical and regulatory staff, not approved ratings.

| ID | Hazardous situation | Possible harm | Cause | S | P | Risk | Controls | Verification | Residual (S×P) |
|---|---|---|---|---|---|---|---|---|---|
| R-01 | Real alarm dropped as a "duplicate" | Delayed treatment | Wrong idempotency key | 5 | 2 | 10 | Natural key includes device, signal and device time; alarms keyed by source event id | `test_ingestion_duplicates_missing_and_thresholds`; generator duplicate test | 5×1 = 5 |
| R-02 | Critical alarm not acknowledged in time | Deterioration unnoticed | Workload, night shift, queue backlog | 5 | 3 | 15 | Severity-first queue; unacknowledged timer; staffing analytics; escalation (CW-201); SLO alerts (CW-602) | E2E ack workflow; escalation tests (planned) | 5×2 = 10 |
| R-03 | Alarm attributed to the wrong patient | Wrong treatment | Device reassigned without update | 5 | 2 | 10 | Device registry with assignment; patient shown with name + ID on every alarm; swap audit (CW-104) | Assignment tests (planned) | 5×1 = 5 |
| R-04 | Stale reading displayed as current | Wrong assessment | Delayed or offline device | 4 | 3 | 12 | `delayed` / `missing` flags; device offline health; latest value shows time; stale indicator (CW-105) | `test_device_fleet_health`; quality tests | 4×2 = 8 |
| R-05 | Excess false alarms | Alarm fatigue, missed true alarms | Fixed thresholds, noisy wearables | 4 | 4 | 16 | Technical vs clinical split; repeat detection; clinician-approved rules (CW-202); fatigue dashboard (CW-204) | Burden-by-device analytics test | 4×3 = 12 → monitored post-market |
| R-06 | On-device AI misclassifies rhythm | Missed or false rhythm event | Model limits, signal quality | 5 | 3 | 15 | Model version provenance; clinician review of every event; PCCP-controlled updates; per-version false-alarm metrics | Provenance test (`test_device_capabilities_respected`) | 5×2 = 10 |
| R-07 | Implausible value triggers or hides an alarm | Wrong assessment | Artifact, unit error | 4 | 3 | 12 | Per-signal plausible ranges → `artifact`, never alarmed; units converted only in adapters | `test_implausible_values_flagged_not_alarmed` | 4×1 = 4 |
| R-08 | Wrong time on events | Wrong sequence, wrong shift metrics | Device clock or timezone errors | 3 | 3 | 9 | Timezone-aware timestamps required; device and receive time stored; UTC storage | Naive-timestamp 422 test | 3×2 = 6 |
| R-09 | Unauthorized access to records | Privacy breach | Weak auth, shared sessions | 4 | 3 | 12 | Server-side RBAC; idle timeout; SSO + MFA (CW-401); least privilege | `test_role_based_authorization`, `test_requires_authentication` | 4×1 = 4 |
| R-10 | Audit trail altered | Undetected misuse | Insider or DB access | 3 | 2 | 6 | Hash-chained audit; verification endpoint; WORM archive (CW-402) | `test_audit_hash_chain_detects_tampering` | 3×1 = 3 |
| R-11 | Consult request lost | Delayed virtual assessment | Integration failure | 4 | 2 | 8 | Transactional outbox; delivery status; retries and DLQ (CW-203) | `test_consult_request_emits_outbox_event_and_audit` | 4×1 = 4 |
| R-12 | Offline / flat-battery wearable unnoticed | Monitoring gap | Patient at home, BLE gateway issue | 4 | 3 | 12 | Per-profile offline thresholds; low-battery alarms; fleet view; patient reminders (CW-302) | `test_device_fleet_health` | 4×2 = 8 |
| R-13 | Platform outage | Monitoring gap | Infrastructure failure | 5 | 2 | 10 | Multi-AZ, health checks, failover; devices keep local alarms; downtime procedure | Failover test (phase 03) | 5×1 = 5 |
| R-14 | Real PHI in development or test | Privacy breach | Copying production data | 4 | 2 | 8 | Synthetic data only; no production access for developers by default; logged exceptions | Policy + access review | 4×1 = 4 |
| R-15 | Descriptive analytics read as causal | Wrong care decisions | Misinterpretation | 3 | 3 | 9 | Disclaimers on every analytics view; outcome caveats; suppression of small cohorts | `test_outcomes_comparison`, `test_small_cohort_suppression` | 3×2 = 6 |
