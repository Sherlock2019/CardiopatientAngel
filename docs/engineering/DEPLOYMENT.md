# Deployment

## Local, production-like (real)
```bash
docker compose up --build          # db + backend (migrate, seed, serve) + frontend (nginx)
```
Web http://localhost:5180 · API http://localhost:8010 · docs http://localhost:8010/docs

## Release record REL-1.3.0 — **simulated example**
| Field | Value |
|---|---|
| Version | 1.3.0 (contains the INC-2026-014 fix) |
| Commit | see `docs/delivery/evidence/meta.json` for the commit the evidence was produced from |
| Evidence | backend, frontend and E2E JUnit results (Engineering Hub → Quality) |
| Checklist | RELEASE_CHECKLIST.md incl. new "retry/duplicate soak test" item |
| Strategy | canary 10% → 100% after 15 min with ALR-001..005 green |
| Approvals | Eng Lead + client product owner (**simulated**) |
| Rollback plan | switch traffic to 1.2.x; migrations backward compatible (KB-0005) |

Production deployment is documented in [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) and has not been performed.
