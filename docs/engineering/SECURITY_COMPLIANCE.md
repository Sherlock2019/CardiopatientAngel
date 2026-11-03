# Security & compliance

Baseline controls and production requirements: [SECURITY.md](../../SECURITY.md). Approved auth pattern: ADR-002.
**This POC is not HIPAA compliant and uses synthetic data only (ADR-006).**

## Role matrix (enforced server-side; live view in Engineering Hub → Security)
| Permission | Nurse | Doctor | Admin | Eng Lead | Engineer | Patient |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| View patients, alarms, analytics | ✓ | ✓ | ✓ | – | – | – |
| Acknowledge / review alarms, request consult | ✓ | ✓ | – | – | – | – |
| Simulator, settings | – | – | ✓ | – | – | – |
| Audit log | – | ✓ | ✓ | – | – | – |
| Engineering Hub, lifecycle | – | – | ✓ | ✓ | ✓ | – |
| Knowledge: read public/internal | – | – | ✓ | ✓ | ✓ | – |
| Knowledge: read restricted | – | – | ✓ | ✓ | – | – |
| Knowledge: submit / approve | – | – | – | submit + approve | submit | – |
| Own record via mobile app | – | – | – | – | – | ✓ (own only) |

Engineers have **no** patient-data permissions: the delivery team in Vietnam works on synthetic data and operational counts.

## HIPAA-oriented threat model (STRIDE, summary)
| Threat | Example | Control (POC → production) |
|---|---|---|
| Spoofing | Stolen session | Signed short-lived tokens, idle timeout → SSO + MFA |
| Tampering | Edit audit history in the DB | Hash-chained audit + verify endpoint → WORM archive |
| Repudiation | "I never acknowledged that alarm" | Acknowledgment audited with user and time |
| Information disclosure | PHI in logs or engineering notes | PHI-free logs; knowledge redaction; engineers without PHI access |
| Denial of service | Device retry storm | Idempotent ingestion, queue + DLQ, rate limiting at the edge |
| Elevation of privilege | Engineer calls clinical API | Permission matrix on every route, tested per role |

## Security checklist (per release)
- [ ] Permission tests for every new route · [ ] audit chain verifies · [ ] SBOM + dependency scan clean
- [ ] Secrets in the secrets manager only · [ ] no PHI in fixtures/logs · [ ] access review of production groups
- [ ] Threat model updated for new integrations (BAA/DPA in place with each partner)
