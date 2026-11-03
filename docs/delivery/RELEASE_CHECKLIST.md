# Release checklist (mapped to IEC 62304)

Every release candidate passes this gate before deployment. Clause numbers refer to IEC 62304 activities;
the quality system owner signs off. Items marked ✅ are already in place in the POC.

## Planning & requirements (5.1, 5.2)
- [ ] Release scope linked to requirement IDs; changed requirements reviewed and approved
- [ ] Software safety class of changed items confirmed with regulatory affairs
- [x] ✅ Requirement IDs traced to tests ([TEST_EVIDENCE.md](TEST_EVIDENCE.md))

## Architecture & design (5.3, 5.4)
- [ ] Architecture changes documented ([../architecture.html](../architecture.html), ARCHITECTURE.md)
- [ ] New SOUP items listed with version, purpose and known anomalies

## Implementation & verification (5.5, 5.6, 5.7)
- [x] ✅ Unit and API tests pass in CI (backend pytest, frontend Vitest)
- [x] ✅ End-to-end clinical workflow passes (alarm → patient → acknowledge → audit)
- [x] ✅ Database migrations apply cleanly from empty (Alembic in CI)
- [ ] Static analysis, dependency and container scans: no unresolved critical findings
- [ ] Performance check on reference load (ingestion lag, alarm latency within SLO)
- [ ] Retry/duplicate soak test: 30 min simulator with retry injection, 0 duplicates stored (added after INC-2026-014)
- [ ] KB-0002 regression set passes
- [ ] Accessibility check of changed screens (severity never by colour alone)

## Risk management (7)
- [ ] Risk register updated for every change; new controls verified
- [ ] Residual risks reviewed; none above the acceptability threshold without justification

## Security & privacy
- [ ] SBOM generated and archived
- [x] ✅ No PHI in logs (error handler logs request id, route and exception type only)
- [x] ✅ Audit hash chain verifies on staging
- [ ] Secrets rotated where required; access reviews current

## Release (5.8) & configuration management (8)
- [ ] All verification complete; known residual anomalies listed with rationale (5.8.1, 5.8.2)
- [ ] Release version, commit hash, SOUP versions and build artifacts archived (5.8.4, 5.8.6)
- [ ] Release built by the pipeline, not by hand; repeatable (5.8.7)
- [ ] Release notes for users, including any changed alarm behaviour
- [ ] Rollback plan tested; database migrations backward compatible

## Problem resolution & maintenance (9, 6)
- [ ] Open problem reports reviewed; safety-relevant ones resolved or justified
- [ ] Post-market inputs (complaints, false-alarm metrics) reviewed for this release
