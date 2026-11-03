---
knowledge_id: INC-2026-014
title: Incident INC-2026-014 - duplicate cardiac alarms caused by device retry events (simulated)
category: Incident postmortems
summary: During a staging soak test, gateway upload retries carried new message ids, so readings and critical alarms were stored twice. Root cause - deduplication keyed on transport message id. Fixed with natural-key idempotent ingestion (ADR-003), regression test, duplicate-ratio alert ALR-001 and a release checklist item.
source_type: incident
owner: eng.tran
reviewer: eng.lead
approval_status: approved
related_feature: CW-102
created: 2026-10-13
access: internal
tags: incident, postmortem, duplicate, retry, alarms, ingestion, incident:duplicate-events
---
# Postmortem INC-2026-014: duplicate cardiac alarms from device retries

> **Simulated incident** created to demonstrate the engineering lifecycle. The fix, test and alert rule it references are real code in this repository.

| | |
|---|---|
| Severity | SEV-2 (staging only; no patient impact) |
| Detected | 2026-10-13 09:40 ICT by the QA soak test and a reviewer's note "same HR-high alarm twice" |
| Resolved | 2026-10-13 17:10 ICT (fix deployed to staging) |
| Owner | Backend/Cardiac Integration (eng.tran) · Incident lead: eng.lead |

## Impact
In a 30-minute soak with the device simulator at 20% upload timeouts, 4.1% of readings and 37 critical alarms were
stored twice. Nurses (in the staging pilot rehearsal) would have seen duplicate critical alarms, wasting
acknowledgment time and adding to alarm fatigue (risk R-01, R-05).

## Timeline (ICT, simulated)
- 09:12 soak test starts with gateway retry injection.
- 09:40 QA flags duplicate alarms with identical device timestamps.
- 10:05 incident declared SEV-2; ingestion feature flag for the new gateway disabled.
- 11:30 root cause confirmed.
- 14:20 fix + regression test merged (two reviewers).
- 17:10 deployed to staging; soak re-run: 0 duplicates stored, duplicates counted and ignored.

## Root cause
The new gateway adapter deduplicated on the **transport message id**. On timeout the gateway retries with a **new**
message id, so the retry looked like a new reading, passed threshold rules again and created a second alarm.

**Contributing factors:** no duplicate metric; design review checklist did not ask for the natural key; retry behaviour
not in the device contract tests.

## What we changed
| Action | Artifact | Status |
|---|---|---|
| Idempotency on natural keys | ADR-003; `backend/app/ingest.py`, constraint `uq_measurement_event` | Done |
| Regression test | `test_ingestion_duplicates_missing_and_thresholds` (`backend/tests/test_api.py`) | Done, passing |
| Duplicate-ratio alert | ALR-001 in `backend/app/api_engineering.py` (Engineering Hub → Operations) | Done |
| Release checklist item | "Retry/duplicate soak test" in `docs/delivery/RELEASE_CHECKLIST.md` | Done |
| Reusable knowledge | KB-0001 (pattern), KB-0002 (required tests), KB-0004 (retrospective) | Approved |
| Design review question "what is the natural key?" | ENGINEERING_STANDARDS.md | Done |

## Repeated category
Second **duplicate-events** incident this quarter (see INC-2026-009). The Knowledge Hub tracks repeated incident
categories so the pattern is visible at planning time.
