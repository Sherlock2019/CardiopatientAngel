# Engineering standards

Coding conventions: [CODING_STANDARDS.md](../delivery/CODING_STANDARDS.md) (healthcare rules, Python, TypeScript, tests).
PR template: [`.github/pull_request_template.md`](../../.github/pull_request_template.md). CI: [CI_CD.md](../delivery/CI_CD.md).

## Code-review checklist
**Correctness & safety**
- [ ] Does the change match the story's acceptance criteria and requirement IDs?
- [ ] New event source? **What is the natural key?** Is ingestion idempotent? (ADR-003, after INC-2026-014)
- [ ] Missing / delayed / implausible data handled and never shown as normal?
- [ ] Alarm behaviour changed? Clinical approval referenced; risk register updated.

**Security & privacy**
- [ ] Route declares `require(permission)`; deny by default; tested for a forbidden role.
- [ ] No PHI in logs, errors, fixtures or screenshots; validation errors do not echo input.
- [ ] Patient-data access and clinical actions audited.

**Quality**
- [ ] Tests added/updated (unit, API, UI); regression case for any bug fixed.
- [ ] Migrations additive and backward compatible.
- [ ] Accessible UI (labels, keyboard, not colour alone).
- [ ] Knowledge Hub searched; new lesson submitted if something was learned.

## Branching and commits
`main` is always releasable. Short-lived branches `CW-123-short-name`; squash merge; commit message
`CW-123: <change> (REQ-ING-01)`.

## Release & rollback strategy
- Semantic versions; release candidate built once by CI and promoted (no rebuilds per environment).
- Blue/green or canary (10% → 100%) with ALR-001..005 watched for 15 minutes.
- Database migrations expand → migrate → contract across two releases; rollback = switch traffic back.
- Feature flags for new device adapters (the INC-2026-014 adapter was disabled by flag in minutes).
- Runbook: [RUNBOOK.md](RUNBOOK.md); knowledge KB-0005.
