# Team structure (10 people, Vietnam delivery centre)

| Role | # | Owns | Key interfaces |
|---|---|---|---|
| Engineering Lead | 1 | Architecture, delivery plan, client communication, hiring, knowledge review | California product owner & CTO |
| Backend / Cardiac Integration | 2 | Ingestion, device adapters, alarms, FHIR, APIs | Device vendors, QA |
| Mobile (React Native) | 2 | Patient app, accessibility, offline sync | UX, backend |
| Web Frontend (React/TS) | 1 | Clinical portal, Engineering Hub | Clinical advisor, backend |
| AI / Data | 1 | Analytics, cohort methods, edge-AI provenance, knowledge retrieval | Clinical advisor |
| QA | 2 | Test strategy, automation, regression catalogue, release evidence | All |
| DevOps | 1 | CI/CD, IaC, observability, security tooling, on-call rota | Client IT security |

## Ownership rules
- Every component has one owning role and one backup (bus factor ≥ 2).
- Changes to ingestion, alarms, auth or audit need two reviewers, one from the owning role.
- QA owns the release evidence; the Engineering Lead signs the release checklist with the client.

## Working with California (UTC−8/−7) from Vietnam (UTC+7)
- Overlap window 07:00–09:00 ICT (= 16:00–18:00 PT previous day): daily async stand-up notes by 08:30 ICT, live call twice a week.
- Weekly client status report every Friday (CLIENT_COLLABORATION.md).
- On-call follows the sun: VN team covers business hours ICT; client team covers US hours; escalation template defines handoff.
