---
knowledge_id: INC-2026-009
title: Incident INC-2026-009 - duplicate live notifications after SSE reconnect (simulated)
category: Incident postmortems
summary: After a network blip the portal reconnected to the live stream and replayed notifications, so nurses saw duplicate pop-ups. Fixed by idempotent event ids on the client and debounced refetch.
source_type: incident
owner: eng.tran
reviewer: eng.lead
approval_status: approved
created: 2026-08-28
access: internal
tags: incident, sse, notifications, duplicate, incident:duplicate-events
---
# INC-2026-009 (simulated, SEV-3)

Duplicate notifications on reconnect. **Fix:** client keys notifications by alarm id; refetch debounced.
**Lesson:** duplicates are a recurring category — see INC-2026-014.
