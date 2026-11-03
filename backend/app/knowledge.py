"""Engineering knowledge: capture → classify → redact → review → index → retrieve (with citations) → reuse.

Retrieval is PostgreSQL full-text search (no LLM required). Answers are extractive: they quote approved
records and cite them; when the evidence is weak the assistant says so instead of guessing.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .auth import PERMISSIONS, User
from .models import KnowledgeRecord, KnowledgeRevision, KnowledgeUse

CATEGORIES = [
    "Requirements & customer decisions",
    "Architecture decision records",
    "Reusable engineering patterns",
    "API integration guides",
    "Testing patterns & regression cases",
    "Deployment & rollback runbooks",
    "Incident postmortems",
    "Lessons learned",
    "Team onboarding guides",
]
STATUSES = ["draft", "in_review", "approved", "rejected", "deprecated"]
ACCESS_LEVELS = ["public", "internal", "restricted"]
SOURCE_TYPES = ["adr", "incident", "code_review", "retrospective", "customer_meeting", "runbook", "guide", "test", "other"]
REVIEW_PERIOD_DAYS = 180
ONBOARDING_TOPICS = ["local-setup", "architecture", "security-phi", "testing", "release", "on-call"]

_KEYWORDS = {
    "Incident postmortems": ["incident", "postmortem", "outage", "root cause", "sev", "pager", "timeline"],
    "Architecture decision records": ["adr", "decision", "we decided", "alternatives", "consequences", "context"],
    "Deployment & rollback runbooks": ["runbook", "rollback", "deploy", "release", "blue/green", "restore"],
    "Testing patterns & regression cases": ["test", "regression", "pytest", "fixture", "assert", "coverage"],
    "API integration guides": ["api", "endpoint", "adapter", "integration", "fhir", "sdk", "payload"],
    "Lessons learned": ["lesson", "retrospective", "retro", "went well", "improve", "learned"],
    "Team onboarding guides": ["onboarding", "new engineer", "setup", "first week", "getting started"],
    "Requirements & customer decisions": ["customer", "client", "requirement", "stakeholder", "agreed", "acceptance"],
    "Reusable engineering patterns": ["pattern", "idempotent", "outbox", "reusable", "template", "approach"],
}

# Sensitive-data checks run before anything is stored. Engineering knowledge must never hold PHI or secrets.
_SENSITIVE = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("phone", re.compile(r"(?<!\w)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b")),
    ("patient_id", re.compile(r"\bP\d{5}\b")),
    ("mrn", re.compile(r"\bMRN[:#\s]*\d{4,}\b", re.I)),
    ("date_of_birth", re.compile(r"\b(?:DOB|date of birth)[:\s]*\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b", re.I)),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b")),
    ("aws_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("secret_assignment", re.compile(r"\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S+", re.I)),
]


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def classify(title: str, summary: str, content: str) -> dict:
    blob = f"{title} {summary} {content}".lower()
    scores = {c: sum(blob.count(k) for k in kws) for c, kws in _KEYWORDS.items()}
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    conf = round(scores[best] / total, 2) if total else 0.0
    return {"category": best if total else "Lessons learned", "confidence": conf, "scores": scores}


def redact(value: str) -> tuple[str, list[str]]:
    found = []
    for name, rx in _SENSITIVE:
        if rx.search(value):
            found.append(name)
            value = rx.sub(f"[REDACTED:{name}]", value)
    return value, found


def access_levels(user: User) -> list[str]:
    levels = ["public", "internal"]
    if user.role in PERMISSIONS["view_restricted_knowledge"]:
        levels.append("restricted")
    return levels


def tag_list(tags: str) -> list[str]:
    return [t.strip() for t in (tags or "").split(",") if t.strip()]


def to_dict(r: KnowledgeRecord, full: bool = True) -> dict:
    d = {c: getattr(r, c) for c in (
        "knowledge_id", "title", "category", "summary", "source_type", "source_reference", "related_project",
        "related_feature", "owner", "reviewer", "approval_status", "version", "created_at", "updated_at",
        "review_due_at", "access_classification", "superseded_by", "redaction_notes")}
    d["tags"] = tag_list(r.tags)
    d["review_due"] = bool(r.approval_status == "approved" and r.review_due_at and r.review_due_at < now())
    d["established_guidance"] = r.approval_status == "approved" and not d["review_due"]
    if full:
        d["content"] = r.content
    return d


def _snapshot(r: KnowledgeRecord) -> str:
    return json.dumps(to_dict(r), default=str, sort_keys=True)


def add_revision(db: Session, r: KnowledgeRecord, by: str, change_type: str, comment: str | None = None,
                 at: datetime | None = None):
    snap = _snapshot(r)
    db.add(KnowledgeRevision(knowledge_id=r.knowledge_id, version=r.version, changed_at=at or now(), changed_by=by,
                             change_type=change_type, status_after=r.approval_status, comment=comment,
                             content_sha256=hashlib.sha256((r.title + r.summary + r.content).encode()).hexdigest(),
                             snapshot=snap))


def next_id(db: Session) -> str:
    ids = db.execute(select(KnowledgeRecord.knowledge_id).where(KnowledgeRecord.knowledge_id.like("KB-%"))).scalars().all()
    n = max((int(i[3:]) for i in ids if i[3:].isdigit()), default=0) + 1
    return f"KB-{n:04d}"


# ------------------------------------------------------------------------------------------- retrieval
def search(db: Session, user: User, q: str, limit: int = 8, feature: str | None = None) -> dict:
    """Hybrid-lite retrieval: OR-ed full-text match ranked by query-term coverage then cover density.
    A related feature (e.g. CW-102) counts as two extra matched terms for records linked to it."""
    lexemes = db.execute(text("SELECT unnest(tsvector_to_array(to_tsvector('english', :q)))"), {"q": q}).scalars().all()
    if not lexemes:
        return {"query": q, "terms": [], "uncovered_terms": [], "results": []}
    levels = access_levels(user)
    # terms that no approved, authorized record contains at all: the question goes beyond our knowledge
    df = dict(db.execute(text("""
        SELECT l, (SELECT count(*) FROM knowledge_records
                   WHERE (search_tsv || to_tsvector('english', category)) @@ quote_literal(l)::tsquery
                     AND approval_status = 'approved'
                     AND access_classification = ANY(:levels))
        FROM unnest(CAST(:lexemes AS text[])) l"""), {"lexemes": lexemes, "levels": levels}).all())
    rows = db.execute(text("""
        SELECT knowledge_id, title, summary, category, approval_status, version, access_classification,
               source_reference, related_feature, review_due_at,
               ts_rank_cd(search_tsv, qq.query, 32) AS rank,
               ts_headline('english', content, qq.query, 'MaxFragments=2, MinWords=6, MaxWords=22, StartSel=«, StopSel=»') AS snippet,
               (SELECT count(*) FROM unnest(CAST(:lexemes AS text[])) l
                 WHERE (search_tsv || to_tsvector('english', category)) @@ quote_literal(l)::tsquery)
                 + CASE WHEN related_feature = CAST(:feature AS text) THEN 2 ELSE 0 END AS matched
        FROM knowledge_records,
             (SELECT string_agg(quote_literal(l), ' | ')::tsquery AS query FROM unnest(CAST(:lexemes AS text[])) l) qq
        WHERE ((search_tsv || to_tsvector('english', category)) @@ qq.query OR related_feature = CAST(:feature AS text))
          AND access_classification = ANY(:levels)
        ORDER BY matched DESC, rank DESC
        LIMIT :limit"""), {"lexemes": lexemes, "levels": levels, "limit": limit, "feature": feature}).mappings().all()
    n_terms = len(lexemes) + (2 if feature else 0)  # an explicit feature link weighs as two terms
    results = []
    for r in rows:
        coverage = min(r["matched"] / n_terms, 1.0)
        due = r["approval_status"] == "approved" and r["review_due_at"] is not None and r["review_due_at"] < now()
        results.append({**{k: r[k] for k in ("knowledge_id", "title", "summary", "category", "approval_status", "version",
                                             "access_classification", "source_reference", "related_feature", "snippet")},
                        "rank": round(float(r["rank"]), 4), "coverage": round(coverage, 2), "review_due": due})
    return {"query": q, "terms": lexemes, "uncovered_terms": [t for t in lexemes if df.get(t, 0) == 0], "results": results}


def answer(db: Session, user: User, q: str, feature: str | None = None) -> dict:
    """Extractive answer from approved knowledge only, with citations and an explicit confidence level."""
    found = search(db, user, q, feature=feature)
    approved = [r for r in found["results"] if r["approval_status"] == "approved"]
    other = [r for r in found["results"] if r["approval_status"] != "approved"]
    top = [r for r in approved[:3] if r["coverage"] >= 0.34]
    best = top[0]["coverage"] if top else 0.0
    uncovered = found["uncovered_terms"]
    if not top or best < 0.5:
        confidence = "insufficient"
    elif uncovered:
        confidence = "low"  # part of the question is about something no approved record mentions
    elif best >= 0.75 and len(top) >= 2:
        confidence = "high"
    elif best >= 0.6:
        confidence = "medium"
    else:
        confidence = "low"
    if confidence == "insufficient":
        text_ = ("I could not find approved engineering guidance that answers this. "
                 "Do not treat any draft or unrelated record as policy; ask the engineering lead or submit a knowledge record once decided.")
    else:
        lines = [f"Approved guidance from {len(top)} record(s):"]
        lines += [f"- {r['title']} [{r['knowledge_id']} v{r['version']}]: {r['summary']}" for r in top]
        if uncovered:
            lines.append(f"Not covered by any approved record: {', '.join(uncovered)}. Treat this answer as partial.")
        if any(r["review_due"] for r in top):
            lines.append("Note: at least one cited record is past its review date; confirm it is still current.")
        text_ = "\n".join(lines)
    cited = [] if confidence == "insufficient" else top
    for r in cited:
        db.add(KnowledgeUse(knowledge_id=r["knowledge_id"], username=user.username, event_type="retrieved",
                            feature=feature, query=q[:300], created_at=now()))
    db.commit()
    return {"question": q, "confidence": confidence, "answer": text_, "citations": cited,
            "weak_matches": approved[:3] if confidence == "insufficient" else [], "uncovered_terms": uncovered,
            "not_established_guidance": other, "method": "PostgreSQL full-text retrieval (extractive, no LLM)"}


# ------------------------------------------------------------------------------------------- metrics
def metrics(db: Session, user: User) -> dict:
    levels = access_levels(user)
    recs = db.execute(select(KnowledgeRecord).where(KnowledgeRecord.access_classification.in_(levels))).scalars().all()
    approved = [r for r in recs if r.approval_status == "approved"]
    t = now()
    uses = db.execute(select(KnowledgeUse.event_type, func.count()).group_by(KnowledgeUse.event_type)).all()
    reused_ids = set(db.execute(select(KnowledgeUse.knowledge_id).where(KnowledgeUse.event_type == "reused")).scalars())
    incidents: dict[str, int] = {}
    for r in recs:
        if r.category == "Incident postmortems":
            for tg in tag_list(r.tags):
                if tg.startswith("incident:"):
                    incidents[tg[9:]] = incidents.get(tg[9:], 0) + 1
    covered = {tg[6:] for r in approved if r.category == "Team onboarding guides" for tg in tag_list(r.tags) if tg.startswith("topic:")}
    return {
        "approved_records": len(approved),
        "by_status": {s: sum(r.approval_status == s for r in recs) for s in STATUSES},
        "by_category": {c: sum(r.category == c for r in approved) for c in CATEGORIES},
        "linked_to_features": sum(1 for r in approved if r.related_feature),
        "retrieval_events": dict(uses).get("retrieved", 0),
        "reuse_events": dict(uses).get("reused", 0),
        "records_reused": len(reused_ids),
        "due_for_review": [r.knowledge_id for r in approved if r.review_due_at and r.review_due_at < t],
        "repeated_incident_categories": {k: v for k, v in sorted(incidents.items(), key=lambda x: -x[1])},
        "onboarding_coverage": {"required": ONBOARDING_TOPICS, "covered": sorted(covered & set(ONBOARDING_TOPICS)),
                                "pct": round(len(covered & set(ONBOARDING_TOPICS)) / len(ONBOARDING_TOPICS) * 100)},
        "note": "Counts only. No productivity improvement is claimed without measured before/after evidence.",
    }


# ------------------------------------------------------------------------------------------- seeding from docs
def _frontmatter(path: Path) -> tuple[dict, str] | None:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---\n"):
        return None
    head, _, body = raw[4:].partition("\n---\n")
    meta = {}
    for line in head.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return (meta, body.strip()) if "knowledge_id" in meta else None


def seed_from_docs(db: Session, docs_dir: Path) -> int:
    """Load every markdown file under docs/ whose front matter has a knowledge_id (ADRs, postmortem, guides)."""
    n = 0
    for path in sorted(docs_dir.rglob("*.md")):
        parsed = _frontmatter(path)
        if not parsed:
            continue
        m, body = parsed
        if db.get(KnowledgeRecord, m["knowledge_id"]):
            continue
        created = datetime.fromisoformat(m.get("created", "2026-09-01")).replace(tzinfo=timezone.utc)
        status = m.get("approval_status", "approved")
        rel = str(path.relative_to(docs_dir.parent)).replace("\\", "/")
        r = KnowledgeRecord(
            knowledge_id=m["knowledge_id"], title=m.get("title", path.stem), category=m.get("category", "Lessons learned"),
            summary=m.get("summary", ""), content=body, source_type=m.get("source_type", "guide"),
            source_reference=m.get("source_reference") or rel, related_project="CardioWatch AI",
            related_feature=m.get("related_feature") or None, owner=m.get("owner", "eng.lead"),
            reviewer=m.get("reviewer") or None, approval_status=status, version=int(m.get("version", 1)),
            created_at=created, updated_at=created,
            review_due_at=(datetime.fromisoformat(m["review_due"]).replace(tzinfo=timezone.utc) if m.get("review_due")
                           else created + timedelta(days=REVIEW_PERIOD_DAYS)),
            access_classification=m.get("access", "internal"), tags=m.get("tags", ""),
            superseded_by=m.get("superseded_by") or None)
        db.add(r)
        db.flush()
        add_revision(db, r, r.owner, "created", "Imported from repository document", at=created)
        if status in ("approved", "deprecated", "rejected", "in_review"):
            add_revision(db, r, r.owner, "submitted", None, at=created)
        if status in ("approved", "deprecated"):
            add_revision(db, r, r.reviewer or "eng.lead", "approved", "Seeded approval (simulated for the demo)", at=created + timedelta(days=1))
        if status == "deprecated":
            add_revision(db, r, r.reviewer or "eng.lead", "deprecated", f"Superseded by {r.superseded_by}", at=created + timedelta(days=30))
        n += 1
    db.commit()
    return n
