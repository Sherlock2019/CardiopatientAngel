"""Engineering Hub API: documents, source traceability, genuine test results, lifecycle trace, operations.

Engineering roles see operational metadata only (counts, statuses) — never patient-level data.
"""
import json
import re
import xml.etree.ElementTree as ET
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import domain as d
from . import knowledge as kb
from .auth import PERMISSIONS, User, require
from .config import DOCS_DIR, REPO_DIR
from .db import get_db
from .models import Alarm, Device, IntegrationEvent, KnowledgeRecord, KnowledgeUse
from .simulator import bus, simulator

router = APIRouter(prefix="/api/engineering", tags=["engineering"])
eng = require("view_engineering")

# Unhandled-error ring buffer (filled by main.py's handler): request id, route template, exception type only.
ERRORS: deque = deque(maxlen=100)

SOURCE_ROOTS = ("docs", "backend/app", "backend/tests", "backend/alembic", ".github", "frontend/src", "frontend/e2e")
SOURCE_EXT = {".md", ".py", ".yml", ".yaml", ".ts", ".tsx", ".csv", ".json"}
EVIDENCE = DOCS_DIR / "delivery" / "evidence"


def _safe(path: str) -> Path:
    """Resolve a repo-relative path, refusing traversal and anything outside the allowlisted roots."""
    p = (REPO_DIR / path).resolve()
    root = REPO_DIR.resolve()
    if root not in p.parents or not any(str(p).startswith(str(root / r)) for r in SOURCE_ROOTS) or p.suffix not in SOURCE_EXT:
        raise HTTPException(404, "Not found")
    if not p.is_file():
        raise HTTPException(404, "Not found")
    return p


@router.get("/docs")
def list_docs(user: User = Depends(eng)):
    out = []
    for p in sorted(DOCS_DIR.rglob("*.md")):
        rel = str(p.relative_to(REPO_DIR)).replace("\\", "/")
        first = next((ln[2:].strip() for ln in p.read_text(encoding="utf-8").splitlines() if ln.startswith("# ")), p.stem)
        out.append({"path": rel, "title": first, "folder": str(p.parent.relative_to(DOCS_DIR)).replace("\\", "/")})
    return out


@router.get("/source")
def source(path: str = Query(max_length=200), user: User = Depends(eng)):
    p = _safe(path)
    raw = p.read_text(encoding="utf-8")
    if raw.startswith("---\n") and p.suffix == ".md":  # hide knowledge front matter in rendered docs
        raw = raw[4:].partition("\n---\n")[2].lstrip()
    return {"path": path, "content": raw, "lines": raw.count("\n") + 1,
            "modified_at": datetime.fromtimestamp(p.stat().st_mtime, timezone.utc)}


def _junit(name: str) -> dict | None:
    f = EVIDENCE / name
    if not f.is_file():
        return None
    root = ET.parse(f).getroot()
    suites = [root] if root.tag == "testsuite" else list(root.iter("testsuite"))
    cases = []
    for s in suites:
        for c in s.iter("testcase"):
            status = "failed" if c.find("failure") is not None or c.find("error") is not None else \
                     "skipped" if c.find("skipped") is not None else "passed"
            cases.append({"name": c.get("name"), "classname": c.get("classname") or s.get("name"),
                          "time_s": float(c.get("time") or 0), "status": status})
    return {"file": f"docs/delivery/evidence/{name}", "total": len(cases),
            "passed": sum(c["status"] == "passed" for c in cases), "failed": sum(c["status"] == "failed" for c in cases),
            "skipped": sum(c["status"] == "skipped" for c in cases),
            "generated_at": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc), "cases": cases}


def test_results() -> dict:
    meta = {}
    if (EVIDENCE / "meta.json").is_file():
        meta = json.loads((EVIDENCE / "meta.json").read_text())
    return {"meta": meta, "suites": {k: _junit(f) for k, f in (("backend", "backend-junit.xml"),
                                                             ("frontend", "frontend-junit.xml"), ("e2e", "e2e-junit.xml"))},
            "how_generated": "scripts/collect_evidence.sh runs the real suites and writes JUnit XML; nothing is hand-edited."}


@router.get("/test-results")
def get_test_results(user: User = Depends(eng)):
    return test_results()


# ------------------------------------------------------------------------------------------- lifecycle
STAGES = [
    {"key": "requirements", "name": "1 · Requirements & planning", "owner": "Engineering Lead + client product owner",
     "inputs": ["Client goals (weekly call)", "Clinical feedback", "Incidents & lessons (Knowledge Hub)"],
     "outputs": ["Requirement with ID", "User stories with acceptance criteria", "Estimate and sprint slot"],
     "gate": "Definition of Ready: acceptance criteria, risks linked, knowledge searched",
     "artifacts": ["docs/engineering/REQUIREMENTS.md", "docs/delivery/BACKLOG.md", "docs/engineering/SPRINT_PLAN.md"]},
    {"key": "design", "name": "2 · Architecture & technical design", "owner": "Engineering Lead / Backend lead",
     "inputs": ["Stories", "Approved ADRs and patterns"], "outputs": ["ADR", "API contract (OpenAPI)", "Risk controls"],
     "gate": "Design review: ADR approved, threat and failure modes considered",
     "artifacts": ["docs/adr/ADR-003-idempotent-ingestion.md", "docs/engineering/SYSTEM_ARCHITECTURE.md", "docs/engineering/api/openapi.json"]},
    {"key": "build", "name": "3 · Development & integration", "owner": "Backend/Cardiac Integration engineers",
     "inputs": ["ADR", "Coding standards"], "outputs": ["Code + migration", "Device profile / adapter"],
     "gate": "PR template complete; two reviewers for ingestion/alarm changes",
     "artifacts": ["backend/app/ingest.py", "backend/app/models.py", "backend/app/simulator.py", ".github/pull_request_template.md"]},
    {"key": "test", "name": "4 · Testing & QA", "owner": "QA engineers", "inputs": ["Acceptance criteria", "Regression catalogue"],
     "outputs": ["Automated tests", "Test results (JUnit)", "Traceability"], "gate": "All tests pass; regression cases for past incidents included",
     "artifacts": ["docs/engineering/TEST_PLAN.md", "backend/tests/test_api.py", "docs/delivery/TEST_EVIDENCE.md"]},
    {"key": "release", "name": "5 · CI/CD & controlled deployment", "owner": "DevOps engineer",
     "inputs": ["Green build", "Release checklist"], "outputs": ["Versioned release", "Deployment record", "Rollback plan"],
     "gate": "Release checklist signed; staged rollout; rollback tested",
     "artifacts": [".github/workflows/ci.yml", "docs/engineering/DEPLOYMENT.md", "docs/delivery/RELEASE_CHECKLIST.md"]},
    {"key": "operate", "name": "6 · Operations & continuous improvement", "owner": "DevOps + on-call engineer",
     "inputs": ["Health checks", "Alert rules", "Error logs (no PHI)"], "outputs": ["Incident record", "Postmortem", "Fix + regression test"],
     "gate": "Blameless postmortem within 5 business days; actions tracked",
     "artifacts": ["docs/engineering/RUNBOOK.md", "docs/engineering/INCIDENT_POSTMORTEM.md"]},
    {"key": "knowledge", "name": "7 · Knowledge compounding", "owner": "Engineering Lead (reviewer) · every engineer (author)",
     "inputs": ["Postmortems", "ADRs", "Code reviews", "Retrospectives"], "outputs": ["Approved, searchable knowledge", "Reuse events"],
     "gate": "Redaction check + reviewer approval; review date set",
     "artifacts": ["docs/engineering/KNOWLEDGE_GOVERNANCE.md", "docs/knowledge/KB-0001-idempotent-device-ingestion.md"]},
]

FEATURE = {
    "title": "Integrate a simulated cardiac monitor and deliver reliable patient alarms",
    "requirement": {"id": "REQ-ING-01", "text": "Duplicate deliveries are ignored, never double-stored or double-alarmed",
                    "doc": "docs/engineering/REQUIREMENTS.md"},
    "stories": ["CW-101", "CW-102"],
    "adr": {"id": "ADR-003", "doc": "docs/adr/ADR-003-idempotent-ingestion.md"},
    "code": [{"path": "backend/app/ingest.py", "symbol": "def ingest_measurement"},
             {"path": "backend/app/ingest.py", "symbol": "def create_alarm"},
             {"path": "backend/app/models.py", "symbol": "uq_measurement_event"},
             {"path": "backend/app/simulator.py", "symbol": "duplicate_probability"}],
    "tests": ["test_ingestion_duplicates_missing_and_thresholds", "test_implausible_values_flagged_not_alarmed",
              "test_generator_realism_features", "test_device_capabilities_respected"],
    "deployment": {"id": "REL-1.3.0", "doc": "docs/engineering/DEPLOYMENT.md", "simulated": True},
    "incident": "INC-2026-014",
    "knowledge": ["KB-0001", "ADR-003", "KB-0004"],
    "future_feature": {"id": "CW-205", "title": "Integrate a new vendor's cuffless BP cloud",
                       "question": "How do we prevent duplicate alarms when a device retries uploads?"},
}


def _find_symbol(path: str, symbol: str) -> int | None:
    try:
        for i, ln in enumerate((REPO_DIR / path).read_text(encoding="utf-8").splitlines(), 1):
            if symbol in ln:
                return i
    except OSError:
        return None
    return None


@router.get("/lifecycle")
def lifecycle(db: Session = Depends(get_db), user: User = Depends(eng)):
    results = test_results()
    status_by_test = {}
    for suite in results["suites"].values():
        for c in (suite or {}).get("cases", []):
            status_by_test[c["name"]] = c["status"]
    kids = list(dict.fromkeys(FEATURE["knowledge"] + [FEATURE["incident"], FEATURE["adr"]["id"]]))
    recs = {r.knowledge_id: r for r in db.execute(select(KnowledgeRecord).where(KnowledgeRecord.knowledge_id.in_(kids))).scalars()}
    reuse = db.execute(select(func.count()).where(KnowledgeUse.event_type == "reused",
                                                  KnowledgeUse.knowledge_id.in_(FEATURE["knowledge"]))).scalar()
    stages = [{**s, "artifacts": [{"path": a, "exists": (REPO_DIR / a).exists()} for a in s["artifacts"]]} for s in STAGES]
    meas = db.execute(text("SELECT quality_status, count(*) FROM cardiac_measurements WHERE received_at > now() - interval '24 hours' "
                           "GROUP BY quality_status")).all()
    trace = {
        **FEATURE,
        "code": [{**c, "line": _find_symbol(c["path"], c["symbol"])} for c in FEATURE["code"]],
        "tests": [{"name": t, "status": status_by_test.get(t, "not run")} for t in FEATURE["tests"]],
        "ci": {"workflow": ".github/workflows/ci.yml", "evidence": results["meta"],
               "note": "Same commands as the CI workflow, run locally by scripts/collect_evidence.sh (no GitHub remote in this POC)."},
        "monitoring": {"simulator_duplicates_ignored": simulator.duplicates_ignored,
                       "simulator_readings_ingested": simulator.measurements_ingested,
                       "quality_last_24h": {k: v for k, v in meas}, "alert_rule": "ALR-001 duplicate delivery ratio"},
        "knowledge_records": [{"knowledge_id": k, "title": recs[k].title if k in recs else None,
                               "status": recs[k].approval_status if k in recs else "missing"} for k in kids],
        "reuse_events_for_feature_knowledge": reuse,
    }
    return {"stages": stages, "feature": trace,
            "simulated_items": ["approvals on seeded knowledge", "deployment record REL-1.3.0", "incident INC-2026-014"]}


# ------------------------------------------------------------------------------------------- operations
@router.get("/operations")
def operations(db: Session = Depends(get_db), user: User = Depends(eng)):
    t = datetime.now(timezone.utc)
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    pending, delivered, oldest = db.execute(select(
        func.count().filter(IntegrationEvent.status == "pending"), func.count().filter(IntegrationEvent.status == "delivered"),
        func.min(IntegrationEvent.occurred_at).filter(IntegrationEvent.status == "pending"))).one()
    crit_unack = db.execute(select(func.min(Alarm.triggered_at)).where(
        Alarm.severity == "critical", Alarm.acknowledged_at.is_(None), Alarm.resolved_at.is_(None))).scalar()
    devices = db.execute(select(Device.device_id, Device.device_type, Device.last_sync_at).where(Device.status == "in_use")).all()
    offline = sum(1 for _, dt, ls in devices if ls and (t - ls).total_seconds() / 60 > d.DEVICE_INFO[dt]["offline_after_min"])
    recent_errors = [e for e in ERRORS if e["at"] > t - timedelta(hours=1)]
    dup_total = simulator.duplicates_ignored + simulator.measurements_ingested
    dup_ratio = simulator.duplicates_ignored / dup_total if dup_total else 0.0
    rules = [
        {"id": "ALR-001", "name": "Duplicate delivery ratio > 5%", "origin": "INC-2026-014",
         "value": f"{dup_ratio * 100:.1f}% of {dup_total} deliveries (since simulator start)", "firing": dup_ratio > 0.05},
        {"id": "ALR-002", "name": "Oldest pending integration event > 5 min", "origin": "ADR-004",
         "value": "none pending" if not oldest else f"{(t - oldest).total_seconds() / 60:.1f} min", "firing": bool(oldest and t - oldest > timedelta(minutes=5))},
        {"id": "ALR-003", "name": "Critical alarm unacknowledged > 5 min", "origin": "R-02",
         "value": "none" if not crit_unack else f"{(t - crit_unack).total_seconds() / 60:.0f} min", "firing": bool(crit_unack and t - crit_unack > timedelta(minutes=5))},
        {"id": "ALR-004", "name": "Devices offline > 10% of fleet", "origin": "R-12",
         "value": f"{offline}/{len(devices)}", "firing": bool(devices and offline / len(devices) > 0.10)},
        {"id": "ALR-005", "name": "Unhandled API errors in the last hour", "origin": "RUNBOOK §3",
         "value": str(len(recent_errors)), "firing": len(recent_errors) > 0},
    ]
    return {
        "as_of": t,
        "services": [
            {"name": "API (FastAPI)", "status": "up"},
            {"name": "Database (PostgreSQL)", "status": "up" if db_ok else "down"},
            {"name": "Device simulator", "status": "running" if simulator.running else "stopped", "last_error": simulator.last_error},
            {"name": "Integration relay", "status": "up", "detail": f"{pending} pending · {delivered} delivered"},
            {"name": "Live stream (SSE)", "status": "up", "detail": f"{len(bus.subscribers)} subscriber(s)"},
        ],
        "alert_rules": rules,
        "recent_errors": list(ERRORS)[-20:],
        "retry_policy": "Ingestion: at-least-once, idempotent keys, retry with backoff, DLQ after 5 attempts (production). "
                        "Outbox: relay retries until delivered; ALR-002 pages when events age > 5 min.",
    }


@router.get("/roles")
def role_matrix(user: User = Depends(eng)):
    """Live permission matrix from the server's source of truth (app/auth.py)."""
    roles = ["nurse", "doctor", "admin", "eng_lead", "engineer", "patient"]
    return {"roles": roles, "permissions": [{"permission": p, **{r: r in allowed for r in roles}} for p, allowed in PERMISSIONS.items()]}
