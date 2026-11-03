---
knowledge_id: KB-0002
title: Required regression tests before deploying the cardiac ingestion service
category: Testing patterns & regression cases
summary: Before any release touching ingestion, alarms or device profiles, these regression tests must pass - duplicate delivery, missing value, delayed delivery, implausible value, naive timestamp, device capability, plus the end-to-end acknowledge workflow.
source_type: test
source_reference: docs/engineering/TEST_PLAN.md
owner: eng.tran
reviewer: eng.lead
approval_status: approved
related_feature: CW-102
created: 2026-10-16
access: internal
tags: testing, regression, ingestion, deployment, release, duplicate
---
# Required regression tests: cardiac ingestion service

Run `cd backend && uv run pytest` and `npx playwright test acknowledge-workflow`. These cases are **mandatory**:

| Case | Test | Origin |
|---|---|---|
| Same reading delivered twice → one row, one alarm | `test_ingestion_duplicates_missing_and_thresholds` | INC-2026-014 |
| Missing value stored as `missing`, no alarm | same test | R-04 |
| Late delivery flagged `delayed`, ordered by device time | same test | R-08 |
| Implausible value → `artifact`, never alarms | `test_implausible_values_flagged_not_alarmed` | R-07 |
| Timestamp without timezone rejected (422) | same ingestion test | INC-2026-011 |
| Device raises only alarms its profile allows | `test_device_capabilities_respected` | ADR-005 |
| Alarm → patient → acknowledge → audit | Playwright `acknowledge-workflow` | REQ-ALM-02 |

A release with any of these failing is blocked by the release checklist.
