# Runbook

## 1. Health
`GET /health` (database, simulator) · Engineering Hub → Operations (services, alert rules, recent errors).

## 2. Alert rules
| Rule | Fires when | First action |
|---|---|---|
| ALR-001 | duplicate delivery ratio > 5% | check gateway retries; confirm duplicates are ignored, not stored (KB-0001) |
| ALR-002 | oldest pending integration event > 5 min | check relay and partner endpoint; events are safe to retry |
| ALR-003 | critical alarm unacknowledged > 5 min | clinical escalation per unit policy (not an engineering fix) |
| ALR-004 | > 10% devices offline | check gateway/vendor cloud status; notify remote-monitoring team |
| ALR-005 | unhandled API errors in last hour | look up request id in logs (no PHI logged); roll back if a new release |

## 3. Errors
Logs carry request id, route template and exception type only. Use the request id to correlate; never paste payloads with PHI into tickets.

## 4. Recovery
- **Bad release:** switch traffic back (KB-0005); migrations are backward compatible.
- **Queue backlog:** scale workers; replay DLQ (idempotent).
- **Database failover:** RDS Multi-AZ automatic; verify `/health`, then audit chain (`GET /api/audit/verify`).
- **Reset the demo:** `uv run python -m app.seed --reset` (synthetic data and knowledge re-imported).

## 5. Incidents
Declare severity, open the incident channel, follow the escalation template (CLIENT_COLLABORATION.md), write a
blameless postmortem within 5 business days and submit lessons to the Knowledge Hub.
