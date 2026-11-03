---
knowledge_id: KB-0004
title: Lessons learned - release R1.3 retrospective
category: Lessons learned
summary: From the last release (R1.3) - add a retry/duplicate soak test before release, alert on duplicate ratio, make dedup keys part of design review, and capture incident fixes as approved knowledge within a week.
source_type: retrospective
source_reference: docs/engineering/INCIDENT_POSTMORTEM.md
owner: eng.lead
reviewer: architecture-board
approval_status: approved
related_feature: CW-102
created: 2026-10-21
access: internal
tags: retrospective, lessons, release, duplicate, process
---
# R1.3 retrospective (simulated)

**Went well:** incident detected in staging soak, not production; fix + regression test merged in one day;
postmortem was blameless and finished in 3 days.

**Lessons learned from the last release**
1. A 30-minute **retry/duplicate soak test** with the device simulator is now a release-checklist item.
2. **ALR-001** duplicate-ratio alert added; we had no signal for duplicates before.
3. Design reviews now ask "what is the natural key?" for every new event source (ADR-003).
4. Incident fixes become **approved knowledge within 5 business days** (KB-0001, KB-0002) so the next team finds them.

**Actions:** owners and due dates tracked in SPRINT_PLAN.md (sprint 7).
