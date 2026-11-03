# Interview demonstration

Start: `./start.sh` → portal http://localhost:5180 · patient app http://localhost:8081 · API docs http://localhost:8010/docs.
Optional for live alarms: log in as Admin → Data Simulator → Start.

**Say once, up front:** synthetic data only; not a medical device; observed alarm rates are not clinical risk.

## Five-minute walkthrough

| Minute | Show | Say |
|---|---|---|
| 1 · Problem & users | Login screen: three experiences (A patient app, B clinical portal, C engineering hub) | Cardiac monitoring creates more alarms than nurses can handle; older adults need a simple companion; the client needs a team that delivers safely from Vietnam. |
| 2 · Nurse workflow | Nurse → Command Center queue → open a patient → **Acknowledge** → Patient 360 (vitals, timeline, check-ins from the mobile app) | Queue is ordered by the device's source severity, never by an unvalidated model. Every view and acknowledgment is audited. |
| 3 · Analytics | Risk Analytics: age bars Rate vs Count, pathology, treatment warning, heatmap, device technical vs clinical | Raw counts mislead: 90+ patients are few, so rates per 100 monitored patient-days are what compare cohorts. Diagnosis exposure only counts while the diagnosis was valid. |
| 4 · Architecture, security, testing, AWS | Engineering Hub → Architecture, Security (live role matrix), Quality (real JUnit results) | FastAPI + PostgreSQL, idempotent ingestion, outbox, hash-chained audit, engineers have no PHI access; AWS path documented (ECS/EKS, RDS, SQS, KMS). **Implemented:** everything shown running. **Planned:** SSO/MFA, FHIR mapping, AWS deployment. |
| 5 · Team & delivery | Hub → Team, Sprint backlog, Client updates (weekly report, escalation, overlap hours) | 10-person team, ownership, Definition of Done, two-week sprints, Friday client report, overlap window 07:00–09:00 ICT. |

## Seven-minute lifecycle and knowledge demo
1. **Requirement enters backlog:** Lifecycle → stage 1 → REQUIREMENTS.md (REQ-ING-01), SPRINT_PLAN.md (CW-205).
2. **Design:** stage 2 → ADR-003.
3. **Working integration:** Admin → Simulator start; Devices page shows fleet; Lifecycle step 7 shows duplicates ignored live.
4. **Tests:** Lifecycle step 4 — the four named tests with real JUnit status.
5. **CI:** step 5 — commit and evidence time; `scripts/collect_evidence.sh` mirrors `.github/workflows/ci.yml`.
6. **Production-like run:** `./start.sh` (Docker Compose: db, API, portal, patient app).
7. **Incident:** step 8 — INC-2026-014 postmortem (simulated): root cause, fix, regression test, ALR-001.
8. **Approved knowledge:** Knowledge Hub → KB-0001 (revision history: created → submitted → approved).
9. **Reuse:** back on Lifecycle → "Ask before building" for CW-205 → citations KB-0001 / INC-2026-014 / ADR-003 → **Apply KB-0001 to CW-205** → reuse counter increments (audited).
   Bonus: ask "What is the parking policy?" → low confidence and the uncovered term is named: the assistant does not invent policy.
   Bonus: log in as Engineer → restricted KB-0011 is invisible; patient pages return 403.

## Implemented vs planned (be explicit)
| Implemented and running | Planned / documented only |
|---|---|
| Patient app (Expo React Native, web build), clinical portal, Engineering Hub, Lifecycle, Knowledge Hub | Native store builds, push notifications |
| FastAPI + PostgreSQL, RBAC, audit hash chain, outbox, device profiles, simulator, SSE | SSO + MFA, FHIR R4 facade, SQS/DLQ |
| 47 backend + 13 frontend + 2 end-to-end tests with JUnit evidence; CI workflow | GitHub Actions run on a remote (no runs yet), SBOM, pen test |
| Docker Compose, `start.sh` (local and EC2) | ECS/EKS, RDS, KMS deployment |
| Full-text knowledge retrieval with citations | pgvector embeddings, optional LLM rephrasing |
