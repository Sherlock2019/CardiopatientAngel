# CI/CD

## Today (`.github/workflows/ci.yml`)

| Job | Steps |
|---|---|
| backend | PostgreSQL service → `uv sync` → `alembic upgrade head` → `pytest` (33 tests) |
| frontend | `npm ci` → `npm run build` (type-check + bundle) → `npm test` (12 tests) |

Locally: `npx playwright test acknowledge-workflow` runs the end-to-end clinical workflow against a running stack.

## Target pipeline

```
PR ──► lint · type-check · unit/API tests · migration check · SAST · dependency scan · SBOM
          │
main ──► build images → sign → push ECR → deploy staging (IaC) → E2E + smoke → traceability report
          │
release ─► release checklist (QMS sign-off) → production blue/green → post-deploy checks → archive artifacts
```

| Gate | Blocks on |
|---|---|
| PR | failing tests, type errors, new critical vulnerabilities, migration that is not backward compatible |
| Staging | E2E failure, SLO regression (ingestion lag, alarm latency), audit chain verification failure |
| Production | unsigned image, incomplete [release checklist](RELEASE_CHECKLIST.md), missing approval |

## Environments

| Env | Data | Access |
|---|---|---|
| Local / CI | synthetic generator (fixed seed) | developers |
| Staging | synthetic, production-like volume | team; no PHI ever |
| Production | real PHI | on-call by approval only; every access logged |

Infrastructure is code (Terraform for AWS; Helm if EKS is chosen), so staging and production differ only in variables.
