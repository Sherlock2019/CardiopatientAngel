## What and why
<!-- Story CW-___ · Requirement REQ-___ · one or two sentences -->

## How it was tested
- [ ] Unit / API tests added or updated (names: ...)
- [ ] UI tests or screenshots (synthetic data only)
- [ ] KB-0002 regression set passes (if ingestion, alarms or device profiles changed)

## Safety, security and privacy
- [ ] New event source: natural key identified, ingestion idempotent (ADR-003)
- [ ] Routes enforce `require(permission)`; forbidden role tested
- [ ] No PHI in code, logs, fixtures, screenshots or this PR
- [ ] Audit entries for new patient-data access or clinical actions
- [ ] Risk register updated (or: no change in clinical behaviour)

## Release notes
<!-- User-visible change, migration notes, feature flags, rollback considerations -->

## Knowledge
- [ ] Searched the Knowledge Hub before starting (records used: ...)
- [ ] Lesson learned submitted for review (if any)
