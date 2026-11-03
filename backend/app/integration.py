"""Transactional outbox for external systems (e.g. a telemedicine platform or EHR).

Events are written in the same transaction as the change that caused them; a relay delivers them later
(in production: SQS / EventBridge / webhook with retries). The demo relay just marks them delivered.
"""
import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import IntegrationEvent

TARGET = "virtual-care-platform"


def emit(db: Session, event_type: str, payload: dict, target: str = TARGET):
    db.add(IntegrationEvent(event_type=event_type, occurred_at=datetime.now(timezone.utc), target=target,
                            payload=json.dumps(payload, default=str), status="pending"))


def _deliver_pending() -> int:
    with SessionLocal() as db:
        n = db.execute(update(IntegrationEvent).where(IntegrationEvent.status == "pending")
                       .values(status="delivered", delivered_at=datetime.now(timezone.utc))).rowcount
        db.commit()
        return n


async def relay_loop(interval: float = 5.0):
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_deliver_pending)
        except Exception:
            pass  # demo relay: retry next round
