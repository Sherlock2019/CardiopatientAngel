# AWS deployment path (documented, not deployed)

The POC runs locally with Docker Compose. Production design (diagram: [architecture.html](../architecture.html)):

| Concern | AWS service | Notes |
|---|---|---|
| Edge | CloudFront + WAF, ALB or API Gateway | TLS 1.2+, rate limiting |
| Identity | Cognito or the hospital IdP (OIDC) | MFA, short-lived tokens (ADR-002) |
| API & workers | ECS Fargate (or EKS, as on ITR's telemedicine platform) | ≥ 2 tasks across AZs, autoscaling |
| Ingestion | SQS + DLQ | at-least-once + idempotent consumers (ADR-003) |
| Database | RDS PostgreSQL Multi-AZ | KMS encryption, PITR, IAM auth |
| Files / archive | S3 with SSE-KMS, Object Lock for audit | lifecycle policies |
| Secrets | Secrets Manager | rotation; nothing in images |
| Observability | CloudWatch logs/metrics/alarms, X-Ray | ALR-001..005; no PHI in telemetry |
| Delivery | GitHub Actions → ECR (signed images) → Terraform/Helm | staging = production code |

**Compliance prerequisites:** AWS BAA in place; HIPAA-eligible services only; client policies for offshore access (ADR-006).
**Cost note:** size from pilot volumes; start with the smallest Multi-AZ RDS class and two Fargate tasks.
