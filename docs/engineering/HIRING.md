# Hiring & onboarding

Scale: 1 (no evidence) · 2 (partial) · 3 (meets bar) · 4 (strong) · 5 (exceptional). Hire bar: average ≥ 3, no 1s,
"healthcare data judgement" ≥ 3 for every role. Interviewers score independently before discussing.

## React Native engineer scorecard
| Area | What we look for | Exercise |
|---|---|---|
| React Native + TypeScript | components, navigation, state, typed API client | build a check-in screen against our OpenAPI |
| Offline & sync | queue, retries, idempotent submit, conflict rules | "phone loses signal mid-submit" |
| Accessibility for older adults | large type, contrast, touch targets, screen readers | review a screen |
| Release & quality | tests, crash reporting, store release | discuss a past release |
| Healthcare data judgement | no PHI in logs/analytics SDKs, secure storage | scenario questions |
| Communication | explains trade-offs in English to a US PO | 5-min walkthrough |

## Backend engineer scorecard
| Area | What we look for | Exercise |
|---|---|---|
| Python / FastAPI | typed APIs, validation, dependency injection | add an endpoint with a permission |
| Data modelling & SQL | constraints, time-bounded joins, migrations | design a readings table |
| Reliability | idempotency, retries, queues, outbox | "device retries uploads" (INC-2026-014) |
| Security | authN/Z, audit, secrets, input validation | review a vulnerable snippet |
| Testing | API tests with real DB, fixtures | write the duplicate-delivery test |
| Healthcare data judgement | PHI handling, synthetic data | scenario questions |

## QA engineer scorecard
| Area | What we look for | Exercise |
|---|---|---|
| Test strategy | risk-based, pyramid, regression catalogue | plan tests for a new device adapter |
| Automation | Playwright/Vitest/pytest, stable selectors | automate the acknowledge flow |
| Clinical risk awareness | missed/duplicate/stale alarms, timezones | find bugs in a seeded build |
| Evidence & traceability | requirement → test → result | read our TEST_EVIDENCE.md |
| Communication | clear bug reports without PHI | write a bug report |

## New engineer onboarding checklist
- [ ] Accounts: GitHub, CI, Knowledge Hub (engineer role — no patient data, no production access)
- [ ] Read KB-0008 (PHI rules) and sign the confidentiality acknowledgment
- [ ] Run the stack locally; log in as each demo role (KB-0007)
- [ ] Architecture tour: SYSTEM_ARCHITECTURE.md, ADR-001..007, Engineering Lifecycle page
- [ ] Run all test suites; read KB-0001 and KB-0002
- [ ] First PR through the template and CI with two reviews
- [ ] Shadow on-call for one week before joining the rota (release and on-call guides still to be written — tracked as onboarding coverage gaps)
- [ ] 30-day check-in with the Engineering Lead
