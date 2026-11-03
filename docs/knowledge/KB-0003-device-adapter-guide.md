---
knowledge_id: KB-0003
title: API integration guide - adding a device adapter
category: API integration guides
summary: How to integrate a new device cloud or SDK - map vendor fields to the signal catalogue, convert units in the adapter, keep device timestamps, rely on idempotent ingestion, and add the mandatory regression tests.
source_type: guide
source_reference: docs/ADDING_A_DEVICE.md
owner: eng.tran
reviewer: eng.lead
approval_status: approved
related_feature: CW-101
created: 2026-10-29
access: internal
tags: integration, adapter, devices, api, sdk, fhir
---
# Adding a device adapter

1. Add signals and a device profile (ADR-005, `docs/ADDING_A_DEVICE.md`).
2. Adapter responsibilities: authenticate to the vendor cloud, map fields, **convert units**, keep the **device timestamp**
   with timezone, attach firmware/model version for provenance.
3. Post to `POST /api/ingest/measurements` (production: publish to the ingestion queue). Retries are safe (KB-0001).
4. Contract tests with recorded vendor payloads (synthetic), plus the KB-0002 regression set.
5. Update the risk register and requirement trace.
