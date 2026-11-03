# Roadmap: from POC to market

Mirrors ITR's Sensa-to-Product journey. Durations are planning estimates for the software platform; device
hardware, clinical studies and regulatory review timelines are set with ITR and the client.

## 01 · POC development (weeks 1–4) — **done**

Market and algorithm validation with synthetic data.

- Care-team portal: command center, live alarm queue, acknowledgment and review, patient detail, outcomes comparison.
- Shared pipeline: idempotent ingestion, quality flags (missing, delayed, artifact), demo alarm rules, SSE live updates.
- Device profiles for bedside, telemetry, ECG patch, cuffless BP and biosensor ring; fleet health view.
- Population analytics (exposure-adjusted), cohort explorer, staffing insights.
- Security baseline: RBAC, audit hash chain, idle timeout, PHI-free logs; integration outbox for virtual consults.
- Evidence: 33 backend + 12 frontend tests + 1 end-to-end workflow, CI, Docker Compose ([TEST_EVIDENCE.md](TEST_EVIDENCE.md)).

**Exit criteria met:** demo runs end to end on 1,000 synthetic patients; the alarm-to-acknowledgment workflow is tested and audited.

## 02 · Funding & validation (months 1–3)

Prototype refinement and evidence for the go/no-go decision.

| Workstream | Output |
|---|---|
| Intended use & regulatory pathway | Written intended use; classification questions answered (FDA MDDS vs device function, Health Canada class, IEC 62304 safety class) |
| Pilot design | One remote-monitoring site (retirement home or remote clinic) and one telemetry ward; success metrics: time-to-acknowledge, alarms per patient-day, false-alarm share |
| Usability (IEC 62366-1) | Formative tests with 5–8 nurses on the alarm queue and acknowledgment flow |
| First real device | Sandbox adapter for one ITR device cloud; real-data quality report (missing / delayed / duplicate rates) |
| Requirements | Software requirements specification baselined with IDs used in backlog and tests |

**Exit:** pilot protocol approved, requirements and risk file baselined, funding decision.

## 03 · Product finalization (months 3–9)

Production-ready engineering inside ITR's ISO 13485 quality system.

- **IEC 62304 design history file:** development plan, requirements, architecture, SOUP list, unit/integration/system verification, traceability.
- **ISO 14971 risk management file:** the [risk register](RISK_REGISTER.md) grown into a full hazard analysis with verified controls.
- **Cybersecurity (IEC 81001-5-1, FDA premarket):** threat model, SBOM, penetration test, vulnerability process.
- **Platform:** AWS production (ECS or EKS, RDS Multi-AZ, KMS, Secrets Manager, CloudWatch), infrastructure as code, SSO + MFA, FHIR R4 mapping.
- **Clients:** patient coaching app (React Native, offline sync); portal hardening and accessibility audit.
- **Validation:** summative usability test; performance and failover tests; pilot run on the release candidate.

**Exit:** release checklist complete ([RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)); submission package ready if the software is a device.

## 04 · Market launch (months 9–12+)

- Regulatory submission support where needed (e.g. FDA 510(k) or Health Canada licence, timing varies by pathway).
- Customer onboarding: BAAs / data-processing agreements, SSO setup, device assignment, training.
- Operations: SLOs and on-call, incident response, backup and restore drills.
- **Post-market surveillance:** complaint handling, alarm false-positive rate per device and model version, CAPA, planned updates under change control.

## Product #2 and beyond

Because the pipeline is shared, the next ITR health IoT product (smart scale, glucose meter, fall pendant, new ring) mainly needs:

1. A device profile and an adapter: about **2–4 weeks** of engineering ([ADDING_A_DEVICE.md](../ADDING_A_DEVICE.md)).
2. New alarm rules, clinically approved and tested.
3. Its own risk analysis delta, verification and validation, and regulatory work.

## Team plan

| Role | Count | Focus |
|---|---|---|
| Tech lead / architect | 1 | architecture decisions, reviews, risk and traceability ownership |
| Backend engineers (Python) | 2 | pipeline, adapters, FHIR, analytics |
| Frontend / mobile (React, React Native) | 2 | portal, coaching app, accessibility |
| QA automation | 1 | test strategy, verification evidence |
| DevOps / cloud | 0.5 | IaC, CI/CD, observability, security tooling |
| UX / usability | 0.5 | IEC 62366 studies, alarm UI |
| Regulatory & quality (ITR QMS) | shared | pathway, DHF review, release approval |
| Clinical advisor | shared | alarm rules, validation, pilot |

**Cadence:** two-week sprints; Definition of Done includes tests linked to requirement IDs, risk register updated, and no PHI in logs or test data.
