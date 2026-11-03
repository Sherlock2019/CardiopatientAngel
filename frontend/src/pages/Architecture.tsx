import { useState } from "react";
import { ArrowDown, Cloud, Server } from "lucide-react";
import { Card, CardHeader, Segmented, cn } from "../components/ui";

/* Front end / API / back end on AWS. "aws" is the documented target (docs/engineering/AWS_DEPLOYMENT.md, not deployed);
   "demo" is what ./start.sh actually runs today. */

type Box = { name: string; aws?: string; detail: string; tone?: "fe" | "api" | "be" | "data" | "ops" | "ext" };
type Tier = { tier: string; note?: string; boxes: Box[] };

const TONE: Record<NonNullable<Box["tone"]>, string> = {
  fe: "border-[#2a78d6]/40 bg-[#2a78d6]/[0.06]",
  api: "border-[#7c3aed]/40 bg-[#7c3aed]/[0.06]",
  be: "border-[#0f9488]/40 bg-[#0f9488]/[0.06]",
  data: "border-[#c2410c]/40 bg-[#c2410c]/[0.06]",
  ops: "border-black/15 bg-black/[0.03]",
  ext: "border-dashed border-black/25 bg-transparent",
};

const AWS: Tier[] = [
  { tier: "Users & devices", boxes: [
    { name: "Nurses & doctors", detail: "Clinical portal in the browser", tone: "ext" },
    { name: "Patients", detail: "React Native app (iOS / Android / web)", tone: "ext" },
    { name: "Engineering team", detail: "Engineering Hub — no PHI access", tone: "ext" },
    { name: "Cardiac IoT devices", detail: "ECG patch · cuffless BP · ring · bedside monitor → BLE/Wi-Fi gateway", tone: "ext" },
  ] },
  { tier: "Front end (edge)", note: "Static builds, TLS, WAF", boxes: [
    { name: "Clinical portal + Engineering Hub", aws: "S3 + CloudFront", detail: "React + TypeScript SPA", tone: "fe" },
    { name: "Patient app (web build)", aws: "S3 + CloudFront", detail: "Expo export; native builds via app stores", tone: "fe" },
    { name: "DNS & protection", aws: "Route 53 · WAF · ACM", detail: "TLS 1.2+, rate limits, geo rules", tone: "fe" },
    { name: "Sign-in", aws: "Cognito / hospital IdP (OIDC)", detail: "MFA, short-lived tokens (ADR-002)", tone: "fe" },
  ] },
  { tier: "API", note: "One REST + SSE contract (OpenAPI)", boxes: [
    { name: "Load balancer", aws: "ALB (or API Gateway)", detail: "HTTPS → private subnets, health checks", tone: "api" },
    { name: "CardioWatch API", aws: "ECS Fargate · FastAPI", detail: "REST, SSE live alarms, server-side RBAC, hash-chained audit · ≥2 tasks across AZs", tone: "api" },
    { name: "Device ingest", aws: "ECS Fargate · /api/ingest", detail: "Idempotent keys, quality flags, plausible ranges (ADR-003)", tone: "api" },
  ] },
  { tier: "Back end services", note: "Private subnets, autoscaling", boxes: [
    { name: "Alarm rules & analytics", aws: "ECS Fargate workers", detail: "Threshold rules, exposure-adjusted rates, outcomes, cohorts", tone: "be" },
    { name: "Integration outbox", aws: "SQS + DLQ", detail: "At-least-once events to the virtual-care platform / EHR", tone: "be" },
    { name: "CardioInsight (AI)", aws: "ECS task · LangGraph", detail: "Operational questions only; Flowise front door; LLM via Bedrock or self-hosted", tone: "be" },
    { name: "Knowledge Hub", aws: "same API · Postgres FTS", detail: "Redaction, review, citations (pgvector planned)", tone: "be" },
  ] },
  { tier: "Data & security", boxes: [
    { name: "PostgreSQL 16", aws: "RDS Multi-AZ", detail: "Patients, readings, alarms, audit · KMS, PITR, IAM auth", tone: "data" },
    { name: "Archive & audit", aws: "S3 SSE-KMS + Object Lock", detail: "Immutable audit exports, lifecycle policies", tone: "data" },
    { name: "Secrets & keys", aws: "Secrets Manager · KMS", detail: "Rotation, nothing baked into images", tone: "data" },
  ] },
  { tier: "Operations", boxes: [
    { name: "Observability", aws: "CloudWatch · X-Ray", detail: "Logs, metrics, alerts ALR-001..005 — no PHI in telemetry", tone: "ops" },
    { name: "CI/CD", aws: "GitHub Actions → ECR → ECS", detail: "pytest, Vitest, Playwright gates; blue/green deploys", tone: "ops" },
    { name: "Hospital systems", detail: "EHR / virtual-care platform (FHIR R4 facade planned)", tone: "ext" },
  ] },
];

const DEMO: Tier[] = [
  { tier: "Browser / phone", boxes: [
    { name: "Clinical portal + Engineering Hub", detail: "http://host:5180", tone: "ext" },
    { name: "Patient app (web build)", detail: "http://host:8081", tone: "ext" },
    { name: "Simulator", detail: "Synthetic device readings (Data Simulator page)", tone: "ext" },
  ] },
  { tier: "Front end containers", boxes: [
    { name: "web", aws: "nginx :5180", detail: "React portal; proxies /api to the backend", tone: "fe" },
    { name: "mobile", aws: "nginx :8081", detail: "Expo web export of the patient app", tone: "fe" },
  ] },
  { tier: "API + back end container", boxes: [
    { name: "backend", aws: "FastAPI :8010", detail: "REST + SSE, RBAC, audit, ingest, alarm rules, analytics, outbox, Knowledge Hub, CardioInsight", tone: "api" },
    { name: "Flowise (optional, local)", aws: "supply-chain stack :3101", detail: "CardioInsight chatflow → backend tool; local Qwen via Ollama", tone: "be" },
  ] },
  { tier: "Data", boxes: [
    { name: "db", aws: "PostgreSQL 16", detail: "Bound to localhost; migrations + synthetic seed on start", tone: "data" },
  ] },
  { tier: "Runtime", boxes: [
    { name: "./start.sh", aws: "Docker Compose", detail: "Local PC or a single AWS EC2 (IMDSv2 detection, free-port picking)", tone: "ops" },
  ] },
];

function TierRow({ t, last }: { t: Tier; last: boolean }) {
  return (
    <div>
      <div className="grid gap-3 md:grid-cols-[170px_1fr]">
        <div className="pt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-2">{t.tier}</div>
          {t.note && <div className="text-[11px] text-muted">{t.note}</div>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {t.boxes.map((b) => (
            <div key={b.name} className={cn("rounded-lg border p-3", TONE[b.tone ?? "ops"])}>
              <div className="text-sm font-semibold">{b.name}</div>
              {b.aws && <div className="mt-0.5 inline-block rounded bg-[#ff9900]/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-[#8a4b00]">{b.aws}</div>}
              <div className="mt-1 text-[11.5px] text-ink-2">{b.detail}</div>
            </div>
          ))}
        </div>
      </div>
      {!last && <div className="flex justify-center py-1 md:pl-[170px]"><ArrowDown size={16} className="text-muted" aria-hidden /></div>}
    </div>
  );
}

export default function Architecture() {
  const [view, setView] = useState<"aws" | "demo">("aws");
  const tiers = view === "aws" ? AWS : DEMO;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Architecture</h1>
          <p className="text-xs text-muted">Front end, API and back end — target AWS deployment and what the demo runs today.</p>
        </div>
        <Segmented label="Architecture view" value={view} onChange={setView}
          options={[{ value: "aws", label: "AWS target" }, { value: "demo", label: "Demo today" }]} />
      </div>
      <Card>
        <CardHeader
          title={view === "aws" ? "CardioWatch on AWS (documented target, not deployed)" : "CardioWatch demo (Docker Compose, local or one EC2)"}
          subtitle={view === "aws" ? "Region with 2 Availability Zones · VPC with public (ALB) and private (Fargate, RDS) subnets" : "Everything below is running when ./start.sh reports healthy"}
          right={<span className="flex items-center gap-1 text-xs text-muted">{view === "aws" ? <Cloud size={14} aria-hidden /> : <Server size={14} aria-hidden />} {view === "aws" ? "AWS" : "Docker"}</span>}
        />
        <div className="space-y-0 p-4">
          {tiers.map((t, i) => <TierRow key={t.tier} t={t} last={i === tiers.length - 1} />)}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-black/5 px-4 py-3 text-[11px] text-ink-2">
          {([["fe", "Front end"], ["api", "API"], ["be", "Back end"], ["data", "Data & security"], ["ops", "Operations"], ["ext", "Outside the system"]] as const).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className={cn("h-3 w-4 rounded border", TONE[k])} aria-hidden /> {l}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="rounded bg-[#ff9900]/15 px-1 font-semibold text-[#8a4b00]">AWS</span> service / runtime</span>
        </div>
      </Card>
      <p className="text-xs text-muted">Details: docs/engineering/AWS_DEPLOYMENT.md · SYSTEM_ARCHITECTURE.md · ADRs in docs/adr/.</p>
    </div>
  );
}
