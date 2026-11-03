---
knowledge_id: ADR-003
title: ADR-003 Idempotent ingestion keyed on device natural keys
category: Architecture decision records
summary: Deduplicate device readings on (device_id, measurement_type, observed_at) and alarms on the upstream source_event_id with INSERT ... ON CONFLICT DO NOTHING; never on transport message ids. Adopted after INC-2026-014.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
related_feature: CW-102
created: 2026-10-14
access: internal
tags: ingestion, idempotency, duplicate, retry, alarms, incident:duplicate-events
---
# ADR-003: Idempotent ingestion keyed on device natural keys

**Status:** Accepted · **Date:** 2026-10-14 · **Trigger:** INC-2026-014 (duplicate cardiac alarms, simulated)

## Context
Device gateways deliver **at least once**. When an upload times out, the gateway retries with a *new transport
message id*. Deduplicating on that id let the same reading through twice and raised the same alarm twice.

## Decision
- **Readings:** unique constraint `uq_measurement_event (device_id, measurement_type, observed_at)`;
  insert with `ON CONFLICT DO NOTHING RETURNING measurement_id`. A missing id means "duplicate, ignored, counted".
- **Alarms:** unique `source_event_id` from the upstream system; same conflict handling.
- **Never** deduplicate on transport ids, receive time or payload hashes that include receive metadata.
- Count duplicates (`duplicates_ignored`) and alert when the ratio exceeds 5% (ALR-001).

## Implementation
`backend/app/ingest.py → ingest_measurement, create_alarm`; constraint in `backend/app/models.py`.

## Verification
Regression test `test_ingestion_duplicates_missing_and_thresholds` posts the same reading twice and asserts one row
and one alarm. Listed as mandatory in KB-0002.

## Consequences
- Safe retries everywhere; replays from the DLQ are harmless.
- Two readings at the exact same device timestamp are treated as one (acceptable; devices emit distinct timestamps).
