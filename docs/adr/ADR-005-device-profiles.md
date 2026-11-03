---
knowledge_id: ADR-005
title: ADR-005 Device profiles as product templates
category: Architecture decision records
summary: Each health IoT product is a configuration profile (signals with LOINC/UCUM, plausible ranges, allowed alarms, offline rules) plus a small adapter; the ingestion, alarm, audit and analytics pipeline is shared.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
related_feature: CW-101
created: 2026-10-28
access: internal
tags: devices, profiles, reuse, iot, adapters
---
# ADR-005: Device profiles as product templates

**Decision:** `app/domain.py → SIGNALS, DEVICE_INFO` is the single registry the pipeline reads. A new product adds a
profile and an adapter (`docs/ADDING_A_DEVICE.md`); no pipeline code changes.

**Why:** ITR ships several health IoT products; re-engineering ingestion, alarms and audit per product multiplies
verification cost and risk.

**Guardrails:** devices may only raise alarms their profile lists (`test_device_capabilities_respected`);
implausible values become artifacts (`test_implausible_values_flagged_not_alarmed`).
