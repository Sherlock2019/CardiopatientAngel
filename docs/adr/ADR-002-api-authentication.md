---
knowledge_id: ADR-002
title: ADR-002 Approved API authentication and authorization pattern
category: Architecture decision records
summary: Every API call carries an OIDC bearer token from the hospital identity provider; the server enforces a central permission matrix on every route, deny by default, and audits patient-data access.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-09-05
access: internal
tags: security, authentication, authorization, oauth, oidc, rbac, api
---
# ADR-002: API authentication and authorization pattern

**Status:** Accepted · **Supersedes:** KB-0009 (API keys in query strings)

## Decision (approved pattern)
1. **Authentication:** OAuth 2.0 / OIDC. Clients send `Authorization: Bearer <token>`; tokens are short-lived and validated
   on every request (signature, expiry, audience). MFA is enforced by the identity provider.
2. **Authorization:** one server-side permission matrix (`app/auth.py → PERMISSIONS`). Each route declares
   `Depends(require("<permission>"))`. Deny by default. The UI hides what a role cannot do, but never enforces it.
3. **Least privilege by role:** clinical roles see patient data; engineering roles see engineering data and operational
   counts only; a patient token is bound to one patient id.
4. **Audit:** patient-record views and clinical actions are written to the hash-chained audit log in the same transaction.
5. **Sessions:** idle timeout (15 min in the portal); tokens never in `localStorage`.

## In the POC
A demo identity switcher issues signed JWTs (no passwords). Everything from step 2 onward is real and tested
(`test_role_based_authorization`, `test_requires_authentication`, `test_patient_view_is_audited`).

## Rejected
- API keys in URLs (leak into logs and proxies) — see deprecated KB-0009.
- Authorization in the frontend only.
