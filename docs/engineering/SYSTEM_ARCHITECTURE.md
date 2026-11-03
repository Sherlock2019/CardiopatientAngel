# System architecture

```
 React Native (Expo)        React + TypeScript
 Patient app                Clinical portal + Engineering Hub
        \                        /
         FastAPI · OIDC/JWT · server-side RBAC · OpenAPI
        /            |              |                \
 PostgreSQL     Analytics      Device simulator     Knowledge Hub
 clinical data  pandas / SQL   cardiac events       full-text retrieval
 audit chain                   + ingestion          with citations
        \__________________________________________/
   Engineering delivery layer: GitHub · CI · tests · audit logs · docs
```

| Layer | Implemented in the POC | Production path |
|---|---|---|
| Patient app | Expo React Native: login, trends, medications, check-in, coaching | App stores, push reminders, offline queue |
| Clinical portal | Command center, live alarms (SSE), Patient 360, analytics, cohorts, staffing, devices | Same, behind SSO + MFA |
| API | FastAPI, Pydantic validation, permission matrix, audit hash chain | ECS Fargate or EKS behind ALB/API Gateway |
| Data | PostgreSQL 16 + Alembic | RDS Multi-AZ, KMS, PITR |
| Integration | Transactional outbox, idempotent ingestion, device profiles | SQS + DLQ, FHIR R4 facade |
| Engineering layer | Hub, lifecycle trace, knowledge workflow, JUnit evidence | GitHub Actions, signed images, IaC |

Diagrams: [docs/architecture.html](../architecture.html). Decisions: [docs/adr/](../adr/). Deployment: [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md).
API contract: [api/openapi.json](api/openapi.json) (generated from code).
