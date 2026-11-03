---
knowledge_id: KB-0008
title: Onboarding - PHI and security rules for engineers
category: Team onboarding guides
summary: Engineers never handle real patient data - synthetic data everywhere, no PHI in logs, tickets, screenshots or knowledge records (automatically redacted), production access only via approved break-glass.
source_type: guide
source_reference: docs/engineering/SECURITY_COMPLIANCE.md
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-09-20
access: internal
tags: onboarding, security, phi, hipaa, topic:security-phi
---
# PHI and security rules

1. Synthetic data only (ADR-006). If you ever see real patient data, stop and report it.
2. No PHI in logs, metrics, tickets, chat, screenshots or knowledge records. Knowledge submissions are scanned and redacted.
3. Your role has no patient-data permissions; that is intentional.
4. Production access: break-glass only, approved by the client and logged.
5. Secrets live in the secrets manager, never in code or `.env` files committed to Git.
