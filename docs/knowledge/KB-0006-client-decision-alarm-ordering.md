---
knowledge_id: KB-0006
title: Customer decision - alarm queue ordered by source severity, no AI risk score
category: Requirements & customer decisions
summary: The California client agreed the nurse queue is ordered by the device's source severity, then unacknowledged, then oldest; any attention indicator stays labelled demo-only and observed alarm rates are never presented as clinical risk.
source_type: customer_meeting
source_reference: docs/engineering/CLIENT_COLLABORATION.md
owner: eng.lead
reviewer: architecture-board
approval_status: approved
related_feature: CW-201
created: 2026-09-12
access: public
tags: customer, decision, alarms, risk, requirements
---
# Decision: alarm ordering and risk language (client weekly call, 2026-09-12, simulated)

- Queue order: **source severity → unacknowledged first → oldest**. No machine-learning ranking.
- The "Operational Attention Indicator" is allowed only as a transparent, demo-labelled helper.
- Analytics show **observed, exposure-adjusted alarm rates**, never "risk of deterioration" or treatment effects.
- Revisit only with clinical validation evidence and regulatory input.
