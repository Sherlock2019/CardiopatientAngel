---
knowledge_id: KB-0012
title: Pattern - time handling (UTC storage, device time vs receive time)
category: Reusable engineering patterns
summary: Store timezone-aware UTC, keep device observed time and server received time separately, reject naive timestamps, convert to local time only for display. Added after INC-2026-011.
source_type: incident
owner: eng.tran
reviewer: eng.lead
approval_status: approved
created: 2026-03-10
review_due: 2026-09-10
access: internal
tags: pattern, time, timezone, utc, incident:time-handling
---
# Pattern: time handling

- `timestamptz` everywhere; Pydantic rejects naive datetimes (422).
- `observed_at` (device) drives analytics; `received_at` measures delay.
- Display conversion only in the UI, with the timezone shown.

*This record is past its review date and should be re-validated.*
