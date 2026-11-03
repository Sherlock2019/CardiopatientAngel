"""Idempotent ingestion of device events. Duplicate deliveries are detected by natural keys."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from . import domain as d
from .config import HOSPITAL_TZ
from .models import Alarm, CardiacMeasurement, Patient


def classify_quality(value: float | None, observed_at: datetime, received_at: datetime,
                     measurement_type: str | None = None) -> str:
    if value is None:
        return "missing"
    if measurement_type and not d.in_range(measurement_type, value):
        return "artifact"  # physiologically implausible for this signal: kept for audit, never alarmed on
    if (received_at - observed_at).total_seconds() > 300:
        return "delayed"
    return "valid"


def ingest_measurement(db: Session, patient: Patient, measurement_type: str, value: float | None,
                       observed_at: datetime, received_at: datetime | None = None,
                       quality: str | None = None) -> tuple[int | None, bool]:
    """Insert one reading. Returns (measurement_id, created). created=False means duplicate ignored."""
    received_at = received_at or datetime.now(timezone.utc)
    stmt = insert(CardiacMeasurement).values(
        patient_id=patient.patient_id,
        device_id=patient.device_id,
        measurement_type=measurement_type,
        numeric_value=None if value is None else round(float(value), 1),
        unit=d.MEASUREMENT_UNITS[measurement_type],
        observed_at=observed_at,
        received_at=received_at,
        quality_status=quality or classify_quality(value, observed_at, received_at, measurement_type),
    ).on_conflict_do_nothing(constraint="uq_measurement_event").returning(CardiacMeasurement.measurement_id)
    mid = db.execute(stmt).scalar()
    return mid, mid is not None


def create_alarm(db: Session, patient: Patient, alarm_type: str, severity: str, triggered_at: datetime,
                 source: str, source_event_id: str, measurement_id: int | None = None,
                 value: float | None = None) -> int | None:
    """Insert an alarm; returns alarm_id or None if this source event was already received."""
    mtype = d.ALARM_MEASUREMENT.get(alarm_type)
    stmt = insert(Alarm).values(
        source_event_id=source_event_id,
        patient_id=patient.patient_id,
        measurement_id=measurement_id,
        alarm_type=alarm_type,
        severity=severity,
        trigger_value=value,
        trigger_unit=d.MEASUREMENT_UNITS[mtype] if (mtype and value is not None) else None,
        triggered_at=triggered_at,
        received_at=datetime.now(timezone.utc),
        assigned_nurse=d.assigned_nurse(patient.care_unit, triggered_at.astimezone(ZoneInfo(HOSPITAL_TZ))),
        clinical_review_status="new",
        source=source,
        simulated_flag=True,
    ).on_conflict_do_nothing(index_elements=["source_event_id"]).returning(Alarm.alarm_id)
    return db.execute(stmt).scalar()
