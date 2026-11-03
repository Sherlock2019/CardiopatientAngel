---
knowledge_id: ADR-006
title: ADR-006 Synthetic data only outside production
category: Architecture decision records
summary: Development, test, staging and demos use the deterministic synthetic generator only; production PHI is never copied to lower environments, and engineers have no default production data access.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-09-03
access: public
tags: security, phi, hipaa, synthetic-data, offshore, policy
---
# ADR-006: Synthetic data only outside production

**Decision:** every non-production environment uses `python -m app.seed` (fixed seed, documented injected patterns).
Engineering roles have no patient-data permissions in the application (`view_clinical` is clinical roles only).
Production access is break-glass only, approved and logged (restricted runbook KB-0011).

**Why:** the delivery team works from Vietnam for a US client; HIPAA does not ban offshore access outright, but access
must be authorized under the client's BAA, contracts and policy. Defaulting to synthetic data removes that exposure
from day-to-day work.
