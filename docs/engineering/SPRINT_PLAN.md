# Sprint plan (two-week sprints)

Capacity: 10 people × 10 days, minus ceremonies and support ≈ 70 points per sprint (velocity of the last three sprints, simulated).

## Sprint 7 (current) — "Reliable device alarms"
**Goal:** a new vendor's cuffless BP cloud feeds the pipeline with no duplicate alarms, and the patient app shows trends.

| Story | Points | Owner | Acceptance criteria | Depends on |
|---|---|---|---|---|
| CW-205 Integrate new vendor cuffless BP cloud (adapter) | 8 | Backend | Vendor payloads mapped; KB-0001 pattern applied; KB-0002 regression set green | ADR-003, ADR-005 |
| CW-102 Ingestion behind SQS + DLQ | 5 | Backend | Poison messages to DLQ; replay is idempotent | ADR-003 |
| CW-206 Retry/duplicate soak test in CI nightly | 3 | QA | 30-min simulator soak, 0 stored duplicates | INC-2026-014 action |
| CW-301 Daily check-in with offline queue | 8 | Mobile | Works offline; syncs once | REQ-MOB-01 |
| CW-207 Patient trend charts (HR, BP) in app | 5 | Mobile | Accessible chart + table text | REQ-MOB-01 |
| CW-602 Observability: ALR-001..005 on dashboards | 5 | DevOps | Alerts visible in Hub → Operations | — |
| CW-208 Patient 360 shows mobile check-ins | 3 | Web | Doctor sees last 10 check-ins | CW-301 |
| CW-703 Automated traceability report | 3 | QA | Requirement → test → result per build | — |
| CW-209 Knowledge Hub review queue | 5 | AI/Data | Redaction, approval, citations | ADR-007 |
| **Total** | **45** | | Remaining capacity for support, spikes and bugs | |

## Definition of Done
- Acceptance criteria met and demoed; tests linked to requirement IDs pass in CI.
- Two reviews for ingestion/alarm/auth/audit changes; PR template complete.
- Risk register and docs updated; no PHI in code, logs, fixtures or screenshots.
- Relevant knowledge searched before work started (Knowledge Hub) and new lessons submitted.

## Risks & blockers
| Item | Type | Owner | Mitigation |
|---|---|---|---|
| Vendor sandbox credentials late | Blocker | Eng Lead | Escalated in weekly report; use recorded synthetic payloads meanwhile |
| Duplicate category repeating (2 incidents) | Risk | Backend | Apply KB-0001 to every new source; soak test nightly |
| Mobile offline conflicts | Risk | Mobile | Server-time wins; idempotent submission ids |
