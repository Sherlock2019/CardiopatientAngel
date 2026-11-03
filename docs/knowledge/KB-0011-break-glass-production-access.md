---
knowledge_id: KB-0011
title: Restricted - break-glass production access procedure
category: Deployment & rollback runbooks
summary: How an on-call engineer obtains time-limited production access during a SEV-1 - client approval, ticket, session recording, automatic expiry and post-incident access review.
source_type: runbook
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-09-25
access: restricted
tags: production access, break-glass, on-call, security, topic:on-call
---
# Break-glass production access (restricted)

1. SEV-1 declared; client on-call approver contacted per escalation template.
2. Ticket opened with reason and scope; access granted for 60 minutes via the identity provider group.
3. Session recorded; every patient-record access is audited.
4. Access expires automatically; access review within 24 hours.
