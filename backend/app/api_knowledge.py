"""Engineering Knowledge Hub API. Engineering roles only; restricted records need the restricted permission."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import audit
from . import knowledge as kb
from .auth import User, require
from .db import get_db
from .models import KnowledgeFeedback, KnowledgeRecord, KnowledgeRevision, KnowledgeUse

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
viewer = require("view_knowledge")


class KnowledgeIn(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    summary: str = Field(min_length=10, max_length=1000)
    content: str = Field(min_length=20, max_length=20000)
    category: str | None = None
    source_type: str = "other"
    source_reference: str | None = Field(default=None, max_length=300)
    related_feature: str | None = Field(default=None, max_length=60)
    access_classification: Literal["public", "internal", "restricted"] = "internal"
    tags: list[str] = Field(default_factory=list, max_length=20)
    submit_for_review: bool = True


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = Field(default=None, max_length=1000)


class DeprecateIn(BaseModel):
    superseded_by: str | None = Field(default=None, max_length=24)
    comment: str = Field(min_length=5, max_length=1000)


class FeedbackIn(BaseModel):
    useful: bool
    comment: str | None = Field(default=None, max_length=500)


class ReuseIn(BaseModel):
    feature: str = Field(min_length=2, max_length=60)
    context: str | None = Field(default=None, max_length=300)


def _validate(body: KnowledgeIn):
    if body.category and body.category not in kb.CATEGORIES:
        raise HTTPException(422, "Unknown category")
    if body.source_type not in kb.SOURCE_TYPES:
        raise HTTPException(422, "Unknown source type")


def _get(db: Session, user: User, knowledge_id: str) -> KnowledgeRecord:
    r = db.get(KnowledgeRecord, knowledge_id)
    if not r or r.access_classification not in kb.access_levels(user):
        raise HTTPException(404, "Knowledge record not found")  # no existence leak for restricted records
    return r


def _clean(body: KnowledgeIn) -> tuple[dict, list[str]]:
    findings: list[str] = []
    out = {}
    for f in ("title", "summary", "content"):
        out[f], found = kb.redact(getattr(body, f))
        findings += found
    return out, sorted(set(findings))


@router.get("/categories")
def categories(user: User = Depends(viewer)):
    return {"categories": kb.CATEGORIES, "statuses": kb.STATUSES, "access_levels": kb.ACCESS_LEVELS,
            "source_types": kb.SOURCE_TYPES}


@router.get("")
def list_records(category: str | None = None, status: str | None = None, q: str | None = Query(None, max_length=200),
                 tag: str | None = Query(None, max_length=60), db: Session = Depends(get_db), user: User = Depends(viewer)):
    stmt = select(KnowledgeRecord).where(KnowledgeRecord.access_classification.in_(kb.access_levels(user)))
    if category:
        stmt = stmt.where(KnowledgeRecord.category == category)
    if status:
        stmt = stmt.where(KnowledgeRecord.approval_status == status)
    if tag:
        stmt = stmt.where(KnowledgeRecord.tags.ilike(f"%{tag}%"))
    if q:
        stmt = stmt.where(or_(KnowledgeRecord.title.ilike(f"%{q}%"), KnowledgeRecord.summary.ilike(f"%{q}%")))
    rows = db.execute(stmt.order_by(KnowledgeRecord.updated_at.desc())).scalars().all()
    return {"items": [kb.to_dict(r, full=False) for r in rows]}


@router.get("/metrics")
def knowledge_metrics(db: Session = Depends(get_db), user: User = Depends(viewer)):
    return kb.metrics(db, user)


@router.get("/review-queue")
def review_queue(db: Session = Depends(get_db), user: User = Depends(require("review_knowledge"))):
    rows = db.execute(select(KnowledgeRecord).where(KnowledgeRecord.approval_status == "in_review")
                      .order_by(KnowledgeRecord.updated_at)).scalars().all()
    due = db.execute(select(KnowledgeRecord).where(KnowledgeRecord.approval_status == "approved",
                                                   KnowledgeRecord.review_due_at < kb.now())).scalars().all()
    return {"in_review": [kb.to_dict(r, full=False) for r in rows], "review_due": [kb.to_dict(r, full=False) for r in due]}


@router.get("/ask")
def ask(q: str = Query(min_length=3, max_length=300), feature: str | None = Query(None, max_length=60),
        db: Session = Depends(get_db), user: User = Depends(viewer)):
    """Engineering assistant: answers only from approved, authorized records, with citations."""
    return kb.answer(db, user, q, feature)


@router.post("/preview")
def preview(body: KnowledgeIn, user: User = Depends(require("submit_knowledge"))):
    """Show the automatic classification and redaction before submitting."""
    _validate(body)
    cleaned, findings = _clean(body)
    return {"classification": kb.classify(cleaned["title"], cleaned["summary"], cleaned["content"]),
            "redactions": findings, **cleaned}


@router.post("")
def create(body: KnowledgeIn, db: Session = Depends(get_db), user: User = Depends(require("submit_knowledge"))):
    _validate(body)
    cleaned, findings = _clean(body)
    cls = kb.classify(cleaned["title"], cleaned["summary"], cleaned["content"])
    t = kb.now()
    r = KnowledgeRecord(
        knowledge_id=kb.next_id(db), **cleaned, category=body.category or cls["category"], source_type=body.source_type,
        source_reference=body.source_reference, related_project="CardioWatch AI", related_feature=body.related_feature,
        owner=user.username, approval_status="in_review" if body.submit_for_review else "draft", version=1,
        created_at=t, updated_at=t, review_due_at=None, access_classification=body.access_classification,
        tags=", ".join(t_.strip() for t_ in body.tags if t_.strip()),
        redaction_notes=("Automatically redacted: " + ", ".join(findings)) if findings else None)
    db.add(r)
    db.flush()
    kb.add_revision(db, r, user.username, "created", f"classified as {cls['category']} ({cls['confidence']})")
    if body.submit_for_review:
        kb.add_revision(db, r, user.username, "submitted")
    audit.record(db, user, "knowledge_create", "knowledge", r.knowledge_id, f"status={r.approval_status}; redactions={findings}")
    db.commit()
    return {**kb.to_dict(r), "classification": cls, "redactions": findings}


@router.put("/{knowledge_id}")
def edit(knowledge_id: str, body: KnowledgeIn, db: Session = Depends(get_db), user: User = Depends(require("submit_knowledge"))):
    """Edits create a new version; approved knowledge goes back to review (no silent changes to guidance)."""
    _validate(body)
    r = _get(db, user, knowledge_id)
    if r.owner != user.username and user.role != "eng_lead":
        raise HTTPException(403, "Only the owner or the engineering lead can edit this record")
    if r.approval_status == "deprecated":
        raise HTTPException(409, "Deprecated records cannot be edited")
    cleaned, findings = _clean(body)
    for k, v in cleaned.items():
        setattr(r, k, v)
    r.category = body.category or r.category
    r.related_feature = body.related_feature
    r.access_classification = body.access_classification
    r.tags = ", ".join(body.tags)
    r.version += 1
    r.updated_at = kb.now()
    r.approval_status = "in_review" if body.submit_for_review else "draft"
    r.reviewer = None
    kb.add_revision(db, r, user.username, "edited", f"redactions={findings}" if findings else None)
    audit.record(db, user, "knowledge_edit", "knowledge", knowledge_id, f"version={r.version}")
    db.commit()
    return kb.to_dict(r)


@router.post("/{knowledge_id}/submit")
def submit(knowledge_id: str, db: Session = Depends(get_db), user: User = Depends(require("submit_knowledge"))):
    r = _get(db, user, knowledge_id)
    if r.approval_status not in ("draft", "rejected"):
        raise HTTPException(409, f"Cannot submit a record that is {r.approval_status}")
    r.approval_status, r.updated_at = "in_review", kb.now()
    kb.add_revision(db, r, user.username, "submitted")
    audit.record(db, user, "knowledge_submit", "knowledge", knowledge_id)
    db.commit()
    return kb.to_dict(r)


@router.post("/{knowledge_id}/review")
def review(knowledge_id: str, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(require("review_knowledge"))):
    r = _get(db, user, knowledge_id)
    if r.approval_status != "in_review":
        raise HTTPException(409, f"Record is {r.approval_status}, not in review")
    if r.owner == user.username:
        raise HTTPException(403, "Separation of duties: authors cannot approve their own records")
    r.reviewer, r.updated_at = user.username, kb.now()
    if body.decision == "approve":
        r.approval_status = "approved"
        r.review_due_at = kb.now() + timedelta(days=kb.REVIEW_PERIOD_DAYS)
    else:
        r.approval_status = "rejected"
    kb.add_revision(db, r, user.username, "approved" if body.decision == "approve" else "rejected", body.comment)
    audit.record(db, user, f"knowledge_{body.decision}", "knowledge", knowledge_id)
    db.commit()
    return kb.to_dict(r)


@router.post("/{knowledge_id}/deprecate")
def deprecate(knowledge_id: str, body: DeprecateIn, db: Session = Depends(get_db), user: User = Depends(require("review_knowledge"))):
    r = _get(db, user, knowledge_id)
    if body.superseded_by and not db.get(KnowledgeRecord, body.superseded_by):
        raise HTTPException(422, "superseded_by does not exist")
    r.approval_status, r.superseded_by, r.updated_at = "deprecated", body.superseded_by, kb.now()
    kb.add_revision(db, r, user.username, "deprecated", body.comment)
    audit.record(db, user, "knowledge_deprecate", "knowledge", knowledge_id, f"superseded_by={body.superseded_by}")
    db.commit()
    return kb.to_dict(r)


@router.post("/{knowledge_id}/feedback")
def feedback(knowledge_id: str, body: FeedbackIn, db: Session = Depends(get_db), user: User = Depends(viewer)):
    _get(db, user, knowledge_id)
    db.add(KnowledgeFeedback(knowledge_id=knowledge_id, username=user.username, useful=body.useful,
                             comment=kb.redact(body.comment)[0] if body.comment else None, created_at=kb.now()))
    db.commit()
    return {"ok": True}


@router.post("/{knowledge_id}/reuse")
def reuse(knowledge_id: str, body: ReuseIn, db: Session = Depends(get_db), user: User = Depends(viewer)):
    """Record that a feature applied this knowledge (the compounding signal)."""
    r = _get(db, user, knowledge_id)
    if r.approval_status != "approved":
        raise HTTPException(409, "Only approved knowledge can be cited as established guidance")
    db.add(KnowledgeUse(knowledge_id=knowledge_id, username=user.username, event_type="reused", feature=body.feature,
                        query=body.context, created_at=kb.now()))
    audit.record(db, user, "knowledge_reuse", "knowledge", knowledge_id, f"feature={body.feature}")
    db.commit()
    return {"ok": True}


@router.get("/{knowledge_id}")
def get_record(knowledge_id: str, db: Session = Depends(get_db), user: User = Depends(viewer)):
    r = _get(db, user, knowledge_id)
    revs = db.execute(select(KnowledgeRevision).where(KnowledgeRevision.knowledge_id == knowledge_id)
                      .order_by(KnowledgeRevision.revision_id)).scalars().all()
    fb = db.execute(select(KnowledgeFeedback.useful, func.count()).where(KnowledgeFeedback.knowledge_id == knowledge_id)
                    .group_by(KnowledgeFeedback.useful)).all()
    uses = db.execute(select(KnowledgeUse).where(KnowledgeUse.knowledge_id == knowledge_id)
                      .order_by(KnowledgeUse.created_at.desc()).limit(50)).scalars().all()
    return {**kb.to_dict(r),
            "revisions": [{c: getattr(v, c) for c in ("revision_id", "version", "changed_at", "changed_by", "change_type",
                                                      "status_after", "comment", "content_sha256")} for v in revs],
            "feedback": {"useful": dict(fb).get(True, 0), "not_useful": dict(fb).get(False, 0)},
            "uses": [{"event_type": u.event_type, "username": u.username, "feature": u.feature, "query": u.query,
                      "created_at": u.created_at} for u in uses]}
