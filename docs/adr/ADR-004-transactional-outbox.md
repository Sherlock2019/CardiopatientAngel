---
knowledge_id: ADR-004
title: ADR-004 Transactional outbox for partner integrations
category: Architecture decision records
summary: Events for external systems (virtual-care platform, EHR) are written to an outbox table in the same transaction as the change and relayed asynchronously with retries; payloads carry identifiers only.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
related_feature: CW-203
created: 2026-10-20
access: internal
tags: integration, outbox, events, sqs, reliability
---
# ADR-004: Transactional outbox

**Decision:** write `integration_events` rows inside the same database transaction as the clinical change
(`app/integration.py → emit`). A relay delivers pending events (production: SQS/EventBridge with retries and a DLQ).

**Why:** calling a partner API inside the request can lose events (crash after commit) or block nurses (slow partner).

**Rules:** identifiers only in payloads (no free-text notes); consumers must be idempotent on `event_id`;
ALR-002 pages when the oldest pending event is older than 5 minutes.

**Tested by:** `test_consult_request_emits_outbox_event_and_audit`, `test_acknowledge_emits_outbox_event`.
