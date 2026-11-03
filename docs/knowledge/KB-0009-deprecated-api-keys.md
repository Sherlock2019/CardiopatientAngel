---
knowledge_id: KB-0009
title: (Deprecated) Device uploads authenticated with API keys in the query string
category: Reusable engineering patterns
summary: Early prototype pattern - devices sent an API key as a URL parameter. Deprecated because keys leak into logs and proxies; replaced by ADR-002.
source_type: other
owner: eng.tran
reviewer: eng.lead
approval_status: deprecated
superseded_by: ADR-002
created: 2026-08-25
access: internal
tags: authentication, api key, deprecated, security
---
# Deprecated: API keys in query strings

Do not use. URLs are logged by proxies, load balancers and browsers. Use the approved pattern in ADR-002.
