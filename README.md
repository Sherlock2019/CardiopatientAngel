# CardioWatch AI

*From Cardiac Monitoring Data to Better Clinical Awareness and Care-Team Coordination.*

A healthcare product **and** engineering-delivery demonstration in three connected experiences:

| | Experience | Built with | What it shows |
|---|---|---|---|
| **A** | Patient mobile app | React Native + TypeScript (Expo; web build included) | Older-adult accessible check-ins, trends, medication reminders, coaching |
| **B** | Nurse & doctor portal | React + TypeScript | Live Command Center, Patient 360, exposure-adjusted Risk Analytics, Cohort Explorer, staffing, devices |
| **C** | Engineering leadership | React + FastAPI + repo docs | Engineering Hub, 7-stage lifecycle with real test evidence, Knowledge Hub with reviewed, cited knowledge |

The monitoring pipeline is reusable across health IoT products: each device is a profile plus an adapter
([docs/ADDING_A_DEVICE.md](docs/ADDING_A_DEVICE.md)).

> **Synthetic data only. Not a medical device. Not HIPAA compliant.** Analytics are descriptive, exposure-adjusted
> associations from generated data with documented injected patterns; they are not clinical risk predictions.

## Architecture at a glance

```text
┌─ FRONTENDS (3 experiences) ──────────────────────────────────────────────────────────┐
│ A  Patient app      React Native (Expo)   trends · medicines · daily check-in        │
│                     :8081                 sees own record only                       │
│ B  Clinical portal  React + TypeScript    alarm queue · Patient 360 · analytics      │
│                     :5180                 cohorts · staffing · devices               │
│ C  Engineering Hub  React + repo docs     lifecycle · quality · ops · knowledge      │
│                     :5180                 no access to patient data                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                      │  REST · SSE live alarms · OpenAPI
                                      v
┌─ BACKEND  FastAPI :8010  ·  server-side RBAC (6 roles)  ·  audit hash chain ─────────┐
│                                                                                      │
│ 1 DEVICES       2 INGEST          3 STORE          4 ANALYZE       5 REVIEW          │
│ ECG patch   ─>  device profiles ─> PostgreSQL 16 ─> alarm rules  ─> alarm queue      │
│ cuffless BP     idempotent keys   patients, dx,    adjusted rates  acknowledge       │
│ ring, bedside   quality flags     readings, alarms cohorts, heatmap review           │
│ simulator       plausible ranges  audit, knowledge staffing        consult           │
│                                                        ^               │             │
│                                                        └─ dispositions ┘             │
│                                                         (false-alarm metrics)        │
└──────────────────────────────────────────────────────────────────────────────────────┘
        │                          │                              │
        v                          v                              v
  PostgreSQL 16              Outbox events               Knowledge Hub
  localhost only             -> virtual-care platform    redact · review · cite

┌─ ENGINEERING DELIVERY LOOP ──────────────────────────────────────────────────────────┐
│ requirements ─> ADRs ─> build + PR review ─> tests ─> CI + Docker ─> operate         │
│      ^          pytest 47 · Vitest 13 · Playwright 2              alerts │           │
│      └───────── Knowledge Hub: lessons are reviewed, cited, reused ──────┘           │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─ KNOWLEDGE FLYWHEEL (seeded example) ────────────────────────────────────────────────┐
│ incident ─> postmortem ─> ADR-003 + fix ─> regression test ─> KB-0001 ─> reuse       │
│ duplicate    root cause:   natural keys    + alert ALR-001     approved   next       │
│ alarms       retry ids     in ingest.py                        & cited    feature    │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─ RUNTIME  ./start.sh  ->  Docker Compose (local or AWS EC2) ─────────────────────────┐
│ browser ─> nginx :5180 (portal + hub) ──┐                                            │
│ phone   ─> nginx :8081 (patient app)  ──┴─> FastAPI :8010 ─> PostgreSQL 16           │
│ AWS path (documented): ECS/EKS · RDS · SQS · KMS · CloudWatch                        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

![Command Center](docs/screenshots/01-command-center.png)

## CardioInsight — governed AI assistant (optional, local PC)

Reuses the SPARC / SCInsight supply-chain stack: **Flowise** front door → **LangGraph** agent manager → **local Qwen**
(Ollama). Operational questions only (workload, alarm fatigue, devices, data quality, engineering knowledge); never
diagnosis or treatment. Code computes every number; LLM text with an unverifiable number is withheld; recommendations
wait for a doctor or admin to approve, then get an outcome check. See [ADR-008](docs/adr/ADR-008-cardioinsight-llm.md).

```text
Flowise CardioInsight chatflow ─> cardiowatch tool ─> LangGraph: understand ─> safety guard ─> specialist (code)
   (guardrail · Qwen · memory)                         ─> explain (local Qwen) ─> number check ─> save ─> human approval
```

```bash
# .env (local only): point CardioWatch at the supply-chain Ollama relay, then ./start.sh
INSIGHT_LLM_BASE_URL=http://172.17.0.1:11435/v1
INSIGHT_LLM_MODEL=qwen2.5:7b
# deploy the chatflow into the running supply-chain Flowise (:3101)
FLOWISE_SCI_API_KEY=... python3 scripts/flowise_cardioinsight.py
# let the portal use it too ("Ask via Flowise" + sidebar link); the key stays server-side
FLOWISE_URL=http://aurelia-scm-flowise-1:3000
FLOWISE_UI_URL=http://localhost:3101
FLOWISE_API_KEY=...            # the SCInsight key
FLOWISE_CONTAINER=aurelia-scm-flowise-1   # start.sh connects it to the CardioWatch network
```

Without `INSIGHT_LLM_BASE_URL` (e.g. the EC2 demo) the portal's **CardioInsight (AI)** page still works with template
answers, the same tools and the same approval flow.

## Start

```bash
./start.sh                 # build + run everything with Docker Compose, wait until healthy, print URLs
```

| Service | URL |
|---|---|
| Clinical portal + Engineering Hub | http://localhost:5180 |
| Patient mobile app (web build) | http://localhost:8081 |
| API + OpenAPI docs | http://localhost:8010/docs |

Demo accounts are on the login screen (no passwords): nurses, doctor, admin (clinical) · engineering lead, engineer
(no patient data) · synthetic patient (mobile app). Other commands: `./start.sh --stop | --logs | --status | --reset-data`.

### On AWS EC2

```bash
# Amazon Linux 2023 or Ubuntu, t3.medium or larger (image builds need ~4 GB RAM), 20 GB disk
git clone git@github.com:Sherlock2019/CardiopatientAngel.git && cd CardiopatientAngel
./start.sh --install        # installs Docker + Compose if missing (sudo), then builds and starts
```

On EC2 the launcher detects the instance (IMDSv2), binds the web, mobile and API ports on all interfaces and prints
the public URLs. **Open inbound TCP 5180, 8081 and 8010 in the Security Group for your own IP only** — the demo has
an identity switcher, not real authentication. PostgreSQL stays bound to localhost. If `--install` just added you to
the `docker` group, the script uses `sudo docker` for that session. Secrets are generated into `.env` (not committed).

## Develop and test without Docker images

```bash
docker compose up -d db
cd backend && uv sync && uv run alembic upgrade head && uv run python -m app.seed --reset
uv run uvicorn app.main:app --port 8010 --reload
cd ../frontend && npm install && npm run dev          # :5180, proxies /api to :8010
cd ../mobile && npm install && EXPO_PUBLIC_API_URL=http://localhost:8010 npx expo start --web   # :8081
```

| Suite | Command | Result at the last evidence run |
|---|---|---|
| Backend (pytest, PostgreSQL) | `cd backend && uv run pytest` | 47 passed |
| Frontend (Vitest) | `cd frontend && npm test` | 13 passed |
| End to end (Playwright) | `cd frontend && npx playwright test acknowledge-workflow mobile-checkin` | 2 passed |

`scripts/collect_evidence.sh` runs all suites, writes JUnit XML to `docs/delivery/evidence/` and regenerates the
OpenAPI file; the Engineering Hub and Lifecycle pages display those results. CI: `.github/workflows/ci.yml`.

## Documentation

| Area | Documents |
|---|---|
| Interview walkthrough | [docs/engineering/INTERVIEW_DEMO.md](docs/engineering/INTERVIEW_DEMO.md) (5-minute and 7-minute scripts) |
| Architecture | [SYSTEM_ARCHITECTURE](docs/engineering/SYSTEM_ARCHITECTURE.md) · [ARCHITECTURE](ARCHITECTURE.md) · [diagrams](docs/architecture.html) · [ADRs](docs/adr/) · [AWS_DEPLOYMENT](docs/engineering/AWS_DEPLOYMENT.md) · [OpenAPI](docs/engineering/api/openapi.json) |
| Delivery | [REQUIREMENTS](docs/engineering/REQUIREMENTS.md) · [TEAM_STRUCTURE](docs/engineering/TEAM_STRUCTURE.md) · [SPRINT_PLAN](docs/engineering/SPRINT_PLAN.md) · [roadmap & backlog](docs/delivery/) · [CLIENT_COLLABORATION](docs/engineering/CLIENT_COLLABORATION.md) · [HIRING](docs/engineering/HIRING.md) |
| Quality | [ENGINEERING_STANDARDS](docs/engineering/ENGINEERING_STANDARDS.md) · [TEST_PLAN](docs/engineering/TEST_PLAN.md) · [TEST_EVIDENCE](docs/delivery/TEST_EVIDENCE.md) · [PR template](.github/pull_request_template.md) |
| Security | [SECURITY](SECURITY.md) · [SECURITY_COMPLIANCE](docs/engineering/SECURITY_COMPLIANCE.md) |
| Operations | [DEPLOYMENT](docs/engineering/DEPLOYMENT.md) · [RUNBOOK](docs/engineering/RUNBOOK.md) · [INCIDENT_POSTMORTEM](docs/engineering/INCIDENT_POSTMORTEM.md) |
| Knowledge | [KNOWLEDGE_GOVERNANCE](docs/engineering/KNOWLEDGE_GOVERNANCE.md) · [records](docs/knowledge/) |
| Analytics | [ANALYTICS_METHODS](ANALYTICS_METHODS.md) · [DEMO_SCRIPT](DEMO_SCRIPT.md) |

## Implemented vs planned

**Implemented and tested:** everything listed above as running — patient app, portal, Engineering Hub, lifecycle
trace, knowledge workflow with redaction/approval/citations, RBAC with engineers isolated from PHI, hash-chained audit,
outbox integration, device profiles, simulator, Docker Compose and `start.sh`.
**Planned / documented only:** SSO + MFA, FHIR R4 facade, SQS + DLQ, AWS production deployment, pgvector embeddings
and optional LLM for the knowledge assistant, native app-store builds. Approvals, the release record and incidents in
the docs are **simulated examples**; code, tests, test results and alert evaluations are real.

## How this was built

Built with an AI coding assistant (Claude Code) from written specifications, iterating as a working vertical slice
first (synthetic data → API → dashboard), then analytics, devices, security, the engineering layer and the mobile app.
