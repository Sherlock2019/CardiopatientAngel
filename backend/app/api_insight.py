"""CardioInsight API: ask the agent manager, review recommendations, record the human decision, check outcomes."""
import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, insight
from . import knowledge as kb
from .auth import User, require
from .db import get_db
from .models import InsightRecommendation

router = APIRouter(prefix="/api/insight", tags=["cardioinsight"])
asker = require("use_insight")


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    comment: str | None = Field(default=None, max_length=500)


def _rec(r: InsightRecommendation) -> dict:
    out = {c: getattr(r, c) for c in ("rec_id", "created_at", "requested_by", "question", "specialist", "action", "rationale",
                                      "metric", "target", "baseline", "better", "status", "decided_by", "decided_at",
                                      "decision_comment", "outcome_checked_at")}
    out["outcome"] = json.loads(r.outcome) if r.outcome else None
    return out


@router.get("/health")
def health(user: User = Depends(asker)):
    return {"llm": insight.llm_health(), "specialists": insight.SPECIALISTS,
            "graph": ["understand", "safety_guard", "run_specialist", "explain", "number_check", "save_recommendations"],
            "rules": ["operational only", "code calculates every number", "numbers checked", "human approval", "outcome check"]}


@router.post("/ask")
def ask(body: AskIn, db: Session = Depends(get_db), user: User = Depends(asker)):
    result = insight.ask(db, user, body.question)
    audit.record(db, user, "insight_ask", "insight", result.get("intent") or "-",
                 f"q={kb.redact(body.question)[0][:200]}; refused={bool(result['refused'])}; recs={result['recommendation_ids']}")
    db.commit()
    ids = result["recommendation_ids"]
    recs = db.execute(select(InsightRecommendation).where(InsightRecommendation.rec_id.in_(ids))).scalars().all() if ids else []
    return {**result, "recommendations": [_rec(r) for r in recs]}


@router.get("/recommendations")
def list_recommendations(status: str | None = Query(None, pattern="^(proposed|approved|rejected)$"), limit: int = Query(50, ge=1, le=200),
                         db: Session = Depends(get_db), user: User = Depends(asker)):
    q = select(InsightRecommendation).order_by(InsightRecommendation.rec_id.desc()).limit(limit)
    if status:
        q = q.where(InsightRecommendation.status == status)
    return {"items": [_rec(r) for r in db.execute(q).scalars()]}


@router.post("/recommendations/{rec_id}/decision")
def decide(rec_id: int, body: DecisionIn, db: Session = Depends(get_db), user: User = Depends(require("approve_operational"))):
    """Only an authorized human (doctor, clinical informatics admin) can approve; the Flowise agent account cannot."""
    r = db.get(InsightRecommendation, rec_id)
    if not r:
        raise HTTPException(404, "Recommendation not found")
    if r.status != "proposed":
        raise HTTPException(409, f"Recommendation already {r.status}")
    r.status = "approved" if body.decision == "approve" else "rejected"
    r.decided_by, r.decided_at, r.decision_comment = user.display_name, datetime.now(timezone.utc), body.comment
    audit.record(db, user, f"insight_{body.decision}", "insight_recommendation", rec_id, r.action[:200])
    db.commit()
    return _rec(r)


@router.post("/recommendations/{rec_id}/outcome")
def outcome(rec_id: int, db: Session = Depends(get_db), user: User = Depends(asker)):
    """Re-measure the same metric for the same target and compare with the baseline (approval is not proof)."""
    r = db.get(InsightRecommendation, rec_id)
    if not r:
        raise HTTPException(404, "Recommendation not found")
    if r.status != "approved":
        raise HTTPException(409, "Only approved recommendations are outcome-checked")
    now_value = insight.measure(db, user, r)
    if now_value is None:
        result = {"current": None, "note": "metric no longer measurable for this target"}
    else:
        delta = round(now_value - r.baseline, 2)
        improved = delta < 0 if r.better == "lower" else delta > 0
        result = {"baseline": r.baseline, "current": now_value, "delta": delta, "improved": improved,
                  "note": "Descriptive before/after comparison on synthetic data; not proof that the action caused the change."}
    r.outcome, r.outcome_checked_at = json.dumps(result), datetime.now(timezone.utc)
    audit.record(db, user, "insight_outcome_check", "insight_recommendation", rec_id, json.dumps(result)[:200])
    db.commit()
    return _rec(r)
