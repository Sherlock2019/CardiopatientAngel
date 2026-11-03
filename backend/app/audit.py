"""Append-only, hash-chained audit log.

Each row stores sha256(prev_hash + canonical row). Editing or deleting any row breaks every later hash,
which `verify()` detects. (Production would also ship rows to WORM storage, e.g. S3 Object Lock.)
"""
import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .auth import User
from .models import AuditLog

GENESIS = "0" * 64


def _canonical(r: AuditLog) -> str:
    return json.dumps([r.occurred_at.astimezone(timezone.utc).isoformat(), r.username, r.role, r.action,
                       r.resource_type, r.resource_id, r.details], separators=(",", ":"))


def _hash(prev: str, r: AuditLog) -> str:
    return hashlib.sha256((prev + _canonical(r)).encode()).hexdigest()


def record(db: Session, user: User, action: str, resource_type: str, resource_id: str, details: str | None = None):
    """Append an audit entry. Caller commits (so the audit row shares the action's transaction)."""
    # Serialize appends so the chain stays linear under concurrent requests.
    db.execute(text("SELECT pg_advisory_xact_lock(724001)"))
    prev = db.execute(select(AuditLog.row_hash).order_by(AuditLog.audit_id.desc()).limit(1)).scalar() or GENESIS
    row = AuditLog(
        occurred_at=datetime.now(timezone.utc).replace(microsecond=0),
        username=user.username,
        role=user.role,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        details=details,
        prev_hash=prev,
    )
    row.row_hash = _hash(prev, row)
    db.add(row)
    db.flush()


def verify(db: Session) -> dict:
    prev = GENESIS
    n = 0
    for r in db.execute(select(AuditLog).order_by(AuditLog.audit_id)).scalars():
        n += 1
        if r.prev_hash != prev or r.row_hash != _hash(prev, r):
            return {"valid": False, "entries_checked": n, "first_broken_audit_id": r.audit_id}
        prev = r.row_hash
    return {"valid": True, "entries_checked": n, "first_broken_audit_id": None}
