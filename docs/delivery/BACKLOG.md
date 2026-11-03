# Backlog

Epics and stories for phases 02–03. Story points are relative (Fibonacci). `R-xx` links to the
[risk register](RISK_REGISTER.md); `REQ-xx` to requirements traced in [TEST_EVIDENCE.md](TEST_EVIDENCE.md).
The same items are in [backlog.csv](backlog.csv) for Jira import (Summary, Issue Type, Epic, Priority, Story Points, Labels, Description).

## E1 · Device integration & ingestion

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-101 | As a platform, ingest readings from an ITR device cloud via an adapter | 8 | Vendor payload mapped to the signal catalogue; units converted in adapter; device timestamp kept; contract tests pass (REQ-ING-01) |
| CW-102 | Move ingestion behind SQS with a dead-letter queue | 5 | At-least-once delivery; poison messages land in the DLQ with alerting; replay tool; no duplicate rows (R-01) |
| CW-103 | Map observations to FHIR R4 `Observation` | 8 | LOINC + UCUM from the profile; provenance resource; validated against the FHIR R4 validator |
| CW-104 | Device assignment workflow (assign / swap / return) | 5 | Readings resolve to the patient assigned at observation time; swap is audited (R-03) |
| CW-105 | Stale-data indicator on every vital | 3 | Value older than the profile threshold shows "stale since …"; never displayed as current (R-04) |

## E2 · Alarm workflow

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-201 | Escalation when a critical alarm is unacknowledged for N minutes | 8 | Configurable per unit; escalates to charge nurse, then physician; all steps audited (R-02) |
| CW-202 | Clinician-approved alarm rule configuration with versioning | 8 | Rules versioned and approved; each alarm stores the rule version (R-05) |
| CW-203 | Virtual consult round-trip | 5 | `consult.requested` delivered to the platform; status back as `consult.started` / `completed`; retries visible (R-11) |
| CW-204 | Alarm fatigue dashboard per device and model version | 5 | False-alarm share from review dispositions, by device type and model version (R-05, R-06) |

## E3 · Patient coaching app (React Native)

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-301 | Daily check-in with offline queue | 8 | Works offline; syncs idempotently; conflicts resolved by server time; WCAG 2.1 AA text sizes |
| CW-302 | Reminders and device pairing status | 5 | Battery and last-sync shown; reminder when device offline beyond its profile threshold (R-12) |
| CW-303 | Patient view of clinician-approved care plan | 5 | Shows only content released by a clinician; no AI-generated advice shown directly |

## E4 · Security & compliance

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-401 | SSO with MFA (OIDC) replacing demo identities | 8 | Hospital IdP; MFA enforced; tokens short-lived in httpOnly cookies; idle timeout kept (R-09) |
| CW-402 | Audit archive to WORM storage | 3 | Hash-chained rows shipped daily to S3 Object Lock; verification job alerts on breaks (R-10) |
| CW-403 | SBOM + dependency and container scanning in CI | 3 | CycloneDX SBOM per release; critical CVEs block release |
| CW-404 | Threat model and penetration test | 5 | STRIDE model reviewed; high findings fixed before release |

## E5 · Analytics

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-501 | Move analytics to SQL materialized views | 8 | Same results as the pandas engine on the reference dataset (regression test); p95 < 1 s |
| CW-502 | Exportable pilot report | 3 | Pilot metrics as PDF/CSV with "descriptive, not causal" disclaimer (R-15) |

## E6 · Platform & DevOps

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-601 | Infrastructure as code for AWS (VPC, ECS/EKS, RDS, KMS) | 8 | Terraform modules; staging and production from the same code; drift detection |
| CW-602 | Observability: logs, metrics, traces, SLO alerts | 5 | Ingestion lag, alarm delivery latency and error budgets on dashboards; no PHI in telemetry (R-02) |
| CW-603 | Multi-instance live updates | 5 | SSE fan-out via Redis or Postgres LISTEN/NOTIFY; tested with 3 replicas |

## E7 · Quality & regulatory

| ID | Story | Pts | Acceptance criteria |
|---|---|---|---|
| CW-701 | Software development plan and requirements baseline (IEC 62304) | 5 | Approved in ITR QMS; requirement IDs used in tests |
| CW-702 | Formative usability study (IEC 62366-1) | 5 | 5–8 nurses; use errors logged and fed into the risk file |
| CW-703 | Automated traceability report | 3 | CI produces requirement → test → result matrix per release |
