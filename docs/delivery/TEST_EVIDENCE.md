# Test evidence

Run on 2026-11-03 at commit `f352bdb` (raw output in [evidence/](evidence/)).

| Suite | Result |
|---|---|
| Backend (pytest, PostgreSQL 16) | **33 passed**, 0 failed |
| Frontend (Vitest + Testing Library) | **12 passed**, 0 failed |
| End-to-end (Playwright, Chromium) | **1 passed**: alarm → patient → acknowledge → status + audit verified |

## Requirement → test traceability

| Req | Requirement | Tests |
|---|---|---|
| REQ-ING-01 | Duplicate deliveries are ignored, never double-stored | `test_ingestion_duplicates_missing_and_thresholds`, `test_generator_realism_features` |
| REQ-ING-02 | Missing and delayed readings are flagged, not shown as normal | `test_ingestion_duplicates_missing_and_thresholds`, `test_patient_measurements_and_alarms` |
| REQ-ING-03 | Implausible values are flagged as artifacts and never alarm | `test_implausible_values_flagged_not_alarmed` |
| REQ-ING-04 | Timestamps without a timezone are rejected; input values never echoed in errors | `test_ingestion_duplicates_missing_and_thresholds` |
| REQ-ALM-01 | Queue shows patient, current value and demo attention factors | `test_alarm_queue_enrichment`; UI: `renders KPIs, the alarm queue…`, `expands the demo attention indicator factors` |
| REQ-ALM-02 | Acknowledgment is recorded once and audited | `test_acknowledge_creates_audit_record`; E2E `nurse acknowledges an alarm…` |
| REQ-ALM-03 | Review records a disposition and resolves the alarm | `test_resolve_with_review` |
| REQ-ALM-04 | Devices only raise alarms their profile allows | `test_device_capabilities_respected` |
| REQ-ALM-05 | Demo threshold rules map values to type and severity | `test_threshold_rules` |
| REQ-SEC-01 | Authentication required on clinical APIs | `test_requires_authentication` |
| REQ-SEC-02 | Server-side role-based authorization | `test_role_based_authorization`, consult-request 403 in `test_consult_request_emits_outbox_event_and_audit` |
| REQ-SEC-03 | Patient record access is audited | `test_patient_view_is_audited`, E2E |
| REQ-SEC-04 | Audit trail is tamper-evident | `test_audit_hash_chain_detects_tampering` |
| REQ-ANA-01 | Rates are exposure-adjusted | `test_exposure_and_rates_by_age` |
| REQ-ANA-02 | Diagnosis cohorts use time-valid exposure | `test_pathology_uses_time_valid_exposure` |
| REQ-ANA-03 | Overlapping orders are not double counted | `test_overlapping_medication_orders_not_double_counted` |
| REQ-ANA-04 | Small cohorts are flagged or suppressed | `test_small_cohort_suppression` |
| REQ-ANA-05 | Cohort filters intersect correctly | `test_cohort_intersection_of_filters` |
| REQ-ANA-06 | Heatmap, trends and staffing totals reconcile | `test_heatmap_counts_sum_to_total`, `test_trends_and_staffing` |
| REQ-ANA-07 | Outcome comparison carries non-causal caveats | `test_outcomes_comparison` |
| REQ-ANA-08 | Analytics inputs are validated | `test_analytics_input_validation` |
| REQ-DEV-01 | Fleet health: offline and low battery per profile | `test_device_fleet_health`, `test_patient_detail_includes_device`; UI `shows fleet health…` |
| REQ-DEV-02 | Device profiles expose signals (LOINC/UCUM) and rules | `test_device_profiles_are_product_templates` |
| REQ-DEV-03 | Burden by device type separates technical alarms | `test_by_device_analytics` |
| REQ-INT-01 | Consult requests produce an outbox event and audit entry | `test_consult_request_emits_outbox_event_and_audit` |
| REQ-INT-02 | Acknowledgments produce an outbox event | `test_acknowledge_emits_outbox_event` |
| REQ-UI-01 | Severity and device health never by colour alone | `severity badges carry a text label`, `shows fleet health…` |
| REQ-UI-02 | Loading, empty and error states | `shows an empty state…`, `shows loading and then an error state…` |
| REQ-UI-03 | Drill-down from alarm to patient; filters reach the API | `drills down from an alarm to the patient`, `sends the selected severity and status to the API` |
| REQ-DATA-01 | Synthetic data is reproducible | `test_generator_is_reproducible` |

## SOUP (software of unknown provenance) at this commit

| Component | Version | Purpose |
|---|---|---|
| PostgreSQL | 16.15 | clinical data store |
| FastAPI / Starlette | 0.162.0 / 1.10.0 | API framework |
| Uvicorn | 0.54.0 | ASGI server |
| SQLAlchemy / Alembic | 2.1.6 / 1.20.1 | ORM / migrations |
| psycopg | 3.3.7 | PostgreSQL driver |
| Pydantic | 2.14.2 | input validation |
| pandas / NumPy | 3.1.0 / 2.5.4 | analytics |
| PyJWT | 2.15.1 | demo session tokens |
| React / React DOM | 18.3.1 | UI |
| React Router | 6.30.6 | routing |
| TanStack Query | 5.105.3 | server state |
| Recharts | 2.15.4 | charts |
| Tailwind CSS | 4.3.4 | styling |
| Vite / TypeScript | 5.4.21 / 5.9.3 | build tooling |

Known anomalies relevant to safety are reviewed per release ([RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)).
