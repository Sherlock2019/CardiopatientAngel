from datetime import datetime, timezone

from sqlalchemy.orm import Session

from .auth import User
from .models import AuditLog


def record(db: Session, user: User, action: str, resource_type: str, resource_id: str, details: str | None = None):
    """Append an audit entry. Caller commits (so the audit row shares the action's transaction)."""
    db.add(AuditLog(
        occurred_at=datetime.now(timezone.utc),
        username=user.username,
        role=user.role,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        details=details,
    ))
