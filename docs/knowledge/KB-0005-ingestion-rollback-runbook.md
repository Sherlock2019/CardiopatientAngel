---
knowledge_id: KB-0005
title: Runbook - deploy and roll back the ingestion service
category: Deployment & rollback runbooks
summary: Blue/green deploy of the API/ingestion service with backward-compatible migrations; roll back by switching traffic to the previous version, then replay the DLQ - safe because ingestion is idempotent.
source_type: runbook
source_reference: docs/engineering/RUNBOOK.md
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-10-22
access: internal
tags: deployment, rollback, runbook, release, ingestion
---
# Deploy and roll back the ingestion service

**Deploy:** migrations first (additive only) → deploy green → smoke tests (`/health`, ingest one synthetic reading,
duplicate test) → shift 10% → watch ALR-001..005 for 15 min → 100%.

**Roll back:** shift traffic to blue (previous version); keep the database (migrations are backward compatible);
replay the DLQ (idempotent, KB-0001); open an incident if alarms were delayed.

**Never:** run destructive migrations in the same release as code that depends on them.
