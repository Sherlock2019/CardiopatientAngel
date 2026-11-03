# Test plan

| Level | Tool | Scope | Where results go |
|---|---|---|---|
| Unit / API | pytest + FastAPI TestClient on PostgreSQL | ingestion, alarms, analytics accuracy, RBAC, audit, devices, knowledge, patient app API | `docs/delivery/evidence/backend-junit.xml` |
| UI | Vitest + Testing Library | rendering, filters, drill-down, loading/empty/error states, devices | `frontend-junit.xml` |
| End to end | Playwright (Chromium) | Command Center → alarm → patient → acknowledge → status + audit | `e2e-junit.xml` |
| Data | generator tests | reproducibility, realism features, device capabilities | backend suite |
| Non-functional (planned) | k6, chaos | ingestion lag, retry storms, failover | phase 03 |

**Regression catalogue:** KB-0002 (mandatory before ingestion releases). Every bug fix adds a test named after the behaviour.

**Generating evidence:** `scripts/collect_evidence.sh` runs all suites and writes JUnit XML plus `meta.json`
(commit, time). The Engineering Hub and Lifecycle pages read those files directly; nothing is typed by hand.

**Entry/exit:** a release candidate requires 0 failing tests, the KB-0002 set, and the release checklist.
