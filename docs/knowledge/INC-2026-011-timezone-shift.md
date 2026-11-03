---
knowledge_id: INC-2026-011
title: Incident INC-2026-011 - shift report off by one hour after DST change (simulated)
category: Incident postmortems
summary: A naive timestamp from a test device was interpreted as local time and moved alarms into the wrong shift after the DST change. Fixed by rejecting naive timestamps and storing UTC.
source_type: incident
owner: eng.tran
reviewer: eng.lead
approval_status: approved
created: 2026-03-09
access: internal
tags: incident, timezone, dst, staffing, incident:time-handling
---
# INC-2026-011 (simulated, SEV-3)

Shift analytics off by one hour after DST. **Fix:** 422 on naive timestamps; UTC storage (KB-0012).
