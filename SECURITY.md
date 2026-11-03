# Security & privacy

**This POC is not HIPAA compliant and must never hold real patient data.** It uses synthetic data exclusively.

## Implemented in the POC

| Control | Implementation |
|---|---|
| Demo authentication | `/api/auth/login` issues a signed HS256 JWT (12 h) for one of four synthetic staff accounts; no passwords |
| Server-side authorization | every route depends on `require(permission)`; permission matrix in `app/auth.py` (e.g. admins cannot acknowledge alarms, nurses cannot run the simulator or read the audit log) |
| Audit logging | `audit_log` rows for patient-record views, alarm acknowledgment, review/resolve, simulator start/stop and settings changes, written in the same transaction as the action |
| Tamper-evident audit | each audit row stores `sha256(previous hash + row)`; `GET /api/audit/verify` recomputes the chain and reports the first broken entry |
| Session timeout | the portal signs users out after 15 minutes without interaction |
| Integration privacy | outbox events carry identifiers only, never free-text clinical notes |
| No PHI in logs | the error handler logs only request id, route template and exception type; validation errors return field locations and messages, never submitted values |
| Secrets | `SECRET_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD` from environment variables (demo defaults must be overridden anywhere shared) |
| Parameterized queries | SQLAlchemy ORM/Core with bound parameters throughout; no string-built SQL from user input |
| Input validation | Pydantic models with bounds; allow-listed vocabularies for units, alarm types, severities, cohort filters, timezones; patient-id pattern |
| Secure errors | generic 500 body with a request id; 401/403/404/409/422 with short messages |
| Network | ports bound to 127.0.0.1 in Compose; CORS restricted to the frontend origin |

Known POC gaps: tokens kept in `sessionStorage` and passed as a query parameter for SSE; no rate limiting; no TLS
locally; settings and simulator are unauthenticated in-memory state of one process.

## What a production deployment would need

- **HIPAA program**: risk analysis, policies, workforce training, minimum-necessary access, breach-notification procedures. Technology alone does not make a system compliant.
- **Business Associate Agreements** with the cloud provider (e.g. AWS BAA, HIPAA-eligible services only) and any subprocessors.
- **Access control**: hospital SSO (SAML/OIDC) with MFA, role/attribute-based access tied to unit and care relationship, break-glass with review, session timeouts, short-lived tokens in httpOnly cookies.
- **Encryption**: TLS 1.2+ everywhere; RDS/S3/EBS encryption at rest with KMS customer-managed keys; key rotation.
- **Audit**: immutable, centrally collected audit logs (CloudWatch → S3 with Object Lock), retained ≥ 6 years, regular access reviews and anomaly alerts.
- **Incident response**: documented runbooks, on-call, forensic log retention, breach assessment and notification timelines.
- **Secure SDLC**: dependency and container scanning, SAST, secrets scanning, penetration testing, change control.
- **Clinical safety**: device integration certified per vendor/regulatory requirements; this software would be a medical device in many jurisdictions if used for alarm management.
