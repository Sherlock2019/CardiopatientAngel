---
knowledge_id: KB-0001
title: Pattern - idempotent ingestion for device events (prevents duplicate alarms on retries)
category: Reusable engineering patterns
summary: Deduplicate on the device natural key (device id + signal + device timestamp) with a unique constraint and ON CONFLICT DO NOTHING; count ignored duplicates; never trust transport message ids. This resolved duplicated cardiac monitoring alarms in INC-2026-014.
source_type: incident
source_reference: docs/engineering/INCIDENT_POSTMORTEM.md
owner: eng.tran
reviewer: eng.lead
approval_status: approved
related_feature: CW-102
created: 2026-10-15
access: internal
tags: pattern, ingestion, idempotency, duplicate, retry, alarms, devices, incident:duplicate-events
---
# Pattern: idempotent ingestion for device events

**Use when:** any device, gateway or partner can retry a delivery (always assume it can).

## How we resolved duplicated cardiac monitoring alarms
1. Pick the **natural key** of the fact, not of the message: `(device_id, measurement_type, observed_at)` for readings,
   `source_event_id` for alarms.
2. Enforce it in the database: unique constraint + `INSERT ... ON CONFLICT DO NOTHING RETURNING id`.
3. Treat "no id returned" as *duplicate ignored*: increment a counter, do **not** evaluate alarm rules again.
4. Expose the counter and alert on the ratio (ALR-001 > 5%).
5. Add the regression test from KB-0002 to the new integration.

```python
mid = db.execute(insert(CardiacMeasurement).values(...)
                 .on_conflict_do_nothing(constraint="uq_measurement_event")
                 .returning(CardiacMeasurement.measurement_id)).scalar()
created = mid is not None   # False => duplicate delivery, ignored
```

## Pitfalls seen
- Deduplicating on gateway message ids (they change on retry) — root cause of INC-2026-014.
- Using server receive time in the key (retries arrive later, so they look new).
- Evaluating alarm rules before the insert succeeded.

**Reference implementation:** `backend/app/ingest.py`. **Decision:** ADR-003.
