# Client collaboration (California client · Vietnam team)

## Weekly status report — sample (week of 2026-11-02, simulated)
**To:** Product Owner, CTO (client) · **From:** Engineering Lead · **Overall:** 🟢 On track (text status: ON TRACK)

| Area | Status | Notes |
|---|---|---|
| Sprint 7 goal "reliable device alarms" | On track | 21 of 45 points done; CW-205 adapter in review |
| Quality | Green | 46 automated tests passing (evidence attached); 0 open SEV-1/2 |
| Incident follow-up INC-2026-014 | Closed | Fix, regression test, alert ALR-001 and checklist item delivered; lessons approved as KB-0001/0002/0004 |
| Patient app | In progress | Check-in and trends demoable on synthetic data |

**Decisions needed from you (by Wed):**
1. Vendor sandbox credentials for the new cuffless BP cloud (blocking CW-205 end-to-end test).
2. Confirm the 5-minute escalation threshold for unacknowledged critical alarms (CW-201).

**Risks:** duplicate-event category has repeated twice; mitigated by mandatory KB-0001 pattern and nightly soak test.
**Next week:** finish CW-205, SQS + DLQ, Patient 360 check-ins, demo on Thursday 08:00 ICT / Wednesday 17:00 PT.

## Architecture Decision Records
Index: [docs/adr/](../adr/) — ADR-001 stack · ADR-002 auth pattern · ADR-003 idempotent ingestion · ADR-004 outbox ·
ADR-005 device profiles · ADR-006 synthetic data only · ADR-007 knowledge retrieval. Client signs off ADRs that affect
security, data or cost.

## Technical escalation template
```
Severity: SEV-1 / SEV-2 / SEV-3
Summary (one line, no PHI):
Start time (ICT and PT):
Impact: who/what is affected, patient-safety relevance (yes/no):
Current status and next update time:
What we need from you (decision, access, vendor contact):
Incident lead (VN) / client counterpart (US):
```
SEV-1: call the client on-call immediately, any hour. SEV-2: message within 30 min, call in overlap window. SEV-3: weekly report.

## Meeting and handoff plan
| Cadence | When (ICT / PT) | Who | Output |
|---|---|---|---|
| Async stand-up notes | daily by 08:30 ICT | whole team | blockers visible before US end of day |
| Overlap call | Tue & Thu 07:30 ICT / Mon & Wed 16:30 PT | Eng Lead, PO, leads | decisions, unblock |
| Sprint review + planning | every other Thu 08:00 ICT | team + client | demo, next sprint scope |
| Weekly status report | Fri 17:00 ICT | Eng Lead → client | report above |
| Daily handoff note | 18:00 ICT | on-call | open issues for the US day |
| Monthly architecture/security review | first Tue | Eng Lead, client CTO | ADR approvals, risk review |
