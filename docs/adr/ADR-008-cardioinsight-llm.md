---
knowledge_id: ADR-008
title: ADR-008 CardioInsight - governed local LLM for operational recommendations
category: Architecture decision records
summary: Add an LLM assistant that reuses the SCInsight supply-chain pattern (Flowise front door, LangGraph agent manager, local Qwen) but only for operational questions; code computes every number, unverifiable LLM numbers are withheld, recommendations need human approval and are outcome-checked.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-11-03
access: internal
tags: llm, qwen, ollama, flowise, langgraph, recommendations, safety
---
# ADR-008: CardioInsight — governed local LLM, operational scope only

**Status:** Accepted · **Reuses:** SPARC / SCInsight supply-chain stack (Flowise, LangGraph pattern, Ollama Qwen relay)

## Decision
- **Scope:** operational only — nurse workload and shifts, alarm fatigue, device fleet, data quality, engineering knowledge.
  No diagnosis, treatment, medication or individual-patient advice (would make it regulated clinical software).
- **Graph (LangGraph, in the CardioWatch backend):** understand → safety guard → deterministic specialist tool →
  explain (local Qwen) → number check → save recommendations (status `proposed`).
- **Numbers:** code computes them; any number in the LLM text not traceable to the tool output (or the question)
  makes the answer fall back to the deterministic template, with the reason shown.
- **Human in the loop:** only a doctor or clinical-informatics admin can approve; the Flowise service account
  (`agent.cardioinsight`) can ask but never approve. Approved items get an outcome check (same metric, same target).
- **Model:** local Qwen 2.5 7B through the supply-chain Ollama relay (`INSIGHT_LLM_BASE_URL`); no data leaves the machine.
  Unset on small hosts (EC2 demo): template answers, same tools, same approvals.
- **Flowise:** `scripts/flowise_cardioinsight.py` clones the deployed SCInsight chat front door (guardrail, Qwen, memory,
  Tool Agent) and swaps its tools for one CardioWatch tool; Flowise guardrail + CardioWatch safety guard = two layers.

## Verification
`backend/tests/test_insight.py`: refusals, agent cannot approve, outcome requires approval, invented numbers withheld,
verified LLM answers used.
