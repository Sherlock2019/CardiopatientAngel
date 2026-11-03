---
knowledge_id: ADR-007
title: ADR-007 Knowledge assistant uses full-text retrieval first, vectors later
category: Architecture decision records
summary: The engineering assistant answers from approved records via PostgreSQL full-text search with citations and an explicit confidence level; pgvector embeddings and an optional LLM are a later, additive step.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-11-03
access: internal
tags: knowledge, retrieval, rag, pgvector, llm
---
# ADR-007: Full-text retrieval first

**Decision:** `GET /api/knowledge/ask` searches approved, authorized records with PostgreSQL full-text search
(OR-ed query terms, ranked by term coverage then cover density) and returns an extractive answer with citations.
When coverage is weak it answers "insufficient evidence" instead of guessing.

**Why:** works offline, needs no model hosting or BAA with an LLM vendor, is fully explainable, and cannot fabricate
policy. Access control is applied *before* retrieval.

**Next (additive):** pgvector embeddings for semantic recall (hybrid with the current ranking), then an optional LLM
that only rephrases retrieved, cited passages. Both keep the same permission filter and citation contract.
