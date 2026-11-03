# Requirements

Requirement IDs are used in stories, commits, tests and the release checklist. Full requirement → test trace:
[TEST_EVIDENCE.md](../delivery/TEST_EVIDENCE.md).

## Users
| User | Need |
|---|---|
| Nurse (hospital unit or remote-monitoring team) | See which monitored patient needs attention now; acknowledge and review alarms quickly |
| Doctor | Review a patient's clinical context, trends and alarm history |
| Clinical operations lead | Understand alarm burden by cohort, hour and shift for staffing conversations |
| Older-adult patient | Simple daily check-in, see own trends and reminders |
| Engineering team (Vietnam) | Build, test, operate and improve the platform without access to real patient data |

## Functional requirements (selected)
| ID | Requirement | Priority | Status |
|---|---|---|---|
| REQ-ING-01 | Duplicate deliveries are ignored, never double-stored or double-alarmed | Must | Implemented + tested |
| REQ-ING-02 | Missing and delayed readings are flagged, never shown as normal | Must | Implemented + tested |
| REQ-ING-03 | Implausible values are flagged as artifacts and never alarm | Must | Implemented + tested |
| REQ-ALM-01 | Alarm queue ordered by source severity, unacknowledged first, oldest first | Must | Implemented + tested |
| REQ-ALM-02 | Acknowledgment recorded once, with user and time, and audited | Must | Implemented + tested |
| REQ-ALM-03 | Review records a disposition | Must | Implemented + tested |
| REQ-ANA-01 | Population alarm rates are exposure-adjusted (per 100 monitored patient-days) | Must | Implemented + tested |
| REQ-ANA-07 | Analytics state they are descriptive; no clinical risk or treatment-effect claims | Must | Implemented + tested |
| REQ-SEC-02 | Role-based authorization enforced server-side | Must | Implemented + tested |
| REQ-SEC-04 | Audit trail is tamper-evident | Should | Implemented + tested |
| REQ-MOB-01 | Patient can log in, see own trends and medications, submit a daily check-in | Should | Implemented + tested |
| REQ-KNW-01 | Engineering knowledge is reviewed before it is recommended; citations shown | Should | Implemented + tested |

## Non-functional
- Synthetic data only outside production (ADR-006). No PHI in logs.
- Alarm path latency target (production): device reading → nurse queue < 10 s p95.
- Accessibility: severity never by colour alone; mobile text ≥ 18 px, touch targets ≥ 48 px.
