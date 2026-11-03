---
knowledge_id: ADR-001
title: ADR-001 Python/FastAPI + PostgreSQL + React/TypeScript stack
category: Architecture decision records
summary: Use FastAPI with PostgreSQL for the API and analytics, React + TypeScript for the portal and React Native for the patient app, in one repository.
source_type: adr
owner: eng.lead
reviewer: architecture-board
approval_status: approved
created: 2026-09-02
access: internal
tags: architecture, stack, fastapi, postgresql, react
---
# ADR-001: Python/FastAPI + PostgreSQL + React/TypeScript

**Status:** Accepted · **Date:** 2026-09-02 · **Deciders:** Engineering Lead, Backend lead, client CTO

## Context
The product combines clinical workflow (transactions, audit), time-series device data and population analytics.
The client's team knows Python and React; ITR's delivery team covers both, plus React Native for mobile.

## Decision
- **API:** FastAPI (typed, OpenAPI generated from code, async where it matters for live streams).
- **Data:** PostgreSQL 16 for clinical records, alarms, audit and knowledge (relational integrity, `timestamptz`, full-text search).
- **Analytics:** pandas over SQL extracts in the POC; SQL materialized views when volumes grow.
- **Web:** React + TypeScript + TanStack Query; **mobile:** React Native (Expo) sharing types and API contracts.
- **One repository** with backend, frontend, mobile, docs and CI.

## Alternatives considered
- GraphQL API (used on ITR's telemedicine platform): rejected for now; REST + OpenAPI is simpler to secure and audit per route.
- MongoDB/DynamoDB: rejected; time-bounded clinical joins (diagnosis valid at alarm time) are relational problems.

## Consequences
- Strong typing end to end; generated API docs at `/docs`.
- PostgreSQL becomes a critical dependency: Multi-AZ RDS in production (see AWS_DEPLOYMENT.md).
