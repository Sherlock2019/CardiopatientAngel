# CardioWatch AI: delivery pack

How a team would take CardioWatch from this proof of concept to market, following ITR's
**POC → Funding & Validation → Product Finalization → Market Launch** journey.

| Document | What it covers |
|---|---|
| [ROADMAP.md](ROADMAP.md) | The four phases for CardioWatch, team plan, and how product #2 reuses the pipeline |
| [BACKLOG.md](BACKLOG.md) · [backlog.csv](backlog.csv) | Epics and stories with acceptance criteria (CSV imports into Jira) |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Rules every change follows, including the healthcare-specific ones |
| [CI_CD.md](CI_CD.md) | Today's pipeline and the target release pipeline with quality gates |
| [RISK_REGISTER.md](RISK_REGISTER.md) | ISO 14971-style hazards, controls and verification |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Release gate mapped to IEC 62304 activities |
| [TEST_EVIDENCE.md](TEST_EVIDENCE.md) | Actual test results, requirement-to-test traceability, SOUP list |

## Why CardioWatch fits ITR

- **ITR builds the devices and device clouds** (ECG patch, cuffless BP, biosensor ring, telemedicine SaaS).
  CardioWatch is the layer above them: care-team alarm workflow, population analytics and integrations.
- **One pipeline, many products.** Device profiles plus adapters mean each new ITR product reuses ingestion, data
  quality, alarms, audit, analytics and integration events ([ADDING_A_DEVICE.md](../ADDING_A_DEVICE.md)).
- **Built the way ITR's regulated work is built:** idempotent ingestion, provenance, audit hash chain, RBAC,
  requirement-to-test traceability and a release gate mapped to IEC 62304.
- **Plugs into ITR's telemedicine work:** alarms can request a virtual consult through an integration outbox,
  the same event-driven pattern (SQS) ITR used on its Canadian virtual-care platform.

All data is synthetic. Nothing here claims regulatory clearance; classification and pathway decisions belong to
regulatory affairs inside ITR's quality system.
