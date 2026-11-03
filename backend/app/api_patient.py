"""Patient self-service API for the mobile app. A patient token is bound to one patient id; every query uses it."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from . import audit
from . import domain as d
from .auth import User, require
from .db import get_db
from .models import CheckIn, Device, Medication, Patient

router = APIRouter(prefix="/api/me", tags=["patient app"])
patient_only = require("patient_self_service")

SYMPTOMS = ["None", "Chest discomfort", "Shortness of breath", "Dizziness", "Palpitations", "Swollen ankles", "Unusual tiredness"]
URGENT = {"Chest discomfort", "Shortness of breath"}


class CheckInIn(BaseModel):
    feeling: int = Field(ge=1, le=5)
    symptoms: list[str] = Field(default_factory=list, max_length=7)
    took_medications: bool
    notes: str | None = Field(default=None, max_length=500)


def _me(db: Session, user: User) -> Patient:
    p = db.get(Patient, user.patient_id) if user.patient_id else None
    if not p:
        raise HTTPException(404, "Patient record not found")
    return p


def _schedule(dose: str, route: str) -> list[str]:
    s = dose.upper()
    if route == "IV" or "/H" in s or "/MIN" in s:
        return []  # given by the care team, not a patient reminder
    if "BID" in s:
        return ["08:00", "20:00"]
    if "TID" in s:
        return ["08:00", "14:00", "20:00"]
    return ["08:00"]


@router.get("")
def me(db: Session = Depends(get_db), user: User = Depends(patient_only)):
    p = _me(db, user)
    latest = {mt: {"value": v, "unit": u, "observed_at": ts, "quality": q} for mt, v, u, ts, q in db.execute(text(
        "SELECT DISTINCT ON (measurement_type) measurement_type, numeric_value, unit, observed_at, quality_status "
        "FROM cardiac_measurements WHERE patient_id = :pid AND numeric_value IS NOT NULL "
        "ORDER BY measurement_type, observed_at DESC"), {"pid": p.patient_id})}
    dev = db.get(Device, p.device_id)
    audit.record(db, user, "patient_self_view", "patient", p.patient_id)
    db.commit()
    first = p.synthetic_name.split()[0]
    return {"first_name": first, "care_unit": p.care_unit, "monitoring_since": p.admission_date,
            "device": None if not dev else {"type": dev.device_type, "battery_pct": dev.battery_pct, "last_sync_at": dev.last_sync_at},
            "latest": latest, "signals": d.DEVICE_INFO[p.device_type]["signals"], "synthetic": True}


@router.get("/trends")
def trends(signal: Literal["heart_rate", "systolic_bp", "diastolic_bp", "spo2", "sleep_hours"] = "heart_rate",
           days: int = Query(7, ge=1, le=30), db: Session = Depends(get_db), user: User = Depends(patient_only)):
    p = _me(db, user)
    rows = db.execute(text(
        "SELECT date_trunc('hour', observed_at) AS t, round(avg(numeric_value)::numeric, 1) AS v FROM cardiac_measurements "
        "WHERE patient_id = :pid AND measurement_type = :s AND numeric_value IS NOT NULL "
        "AND quality_status IN ('valid','delayed') AND observed_at > now() - make_interval(days => :days) "
        "GROUP BY 1 ORDER BY 1"), {"pid": p.patient_id, "s": signal, "days": days}).all()
    return {"signal": signal, "unit": d.MEASUREMENT_UNITS[signal], "points": [{"t": t, "v": float(v)} for t, v in rows]}


@router.get("/medications")
def medications(db: Session = Depends(get_db), user: User = Depends(patient_only)):
    p = _me(db, user)
    meds = db.execute(select(Medication).where(Medication.patient_id == p.patient_id, Medication.status == "active")).scalars()
    return [{"name": m.medication_name, "dose": m.prescribed_dose, "route": m.route, "times": _schedule(m.prescribed_dose, m.route)}
            for m in meds]


@router.get("/checkins")
def list_checkins(db: Session = Depends(get_db), user: User = Depends(patient_only)):
    p = _me(db, user)
    rows = db.execute(select(CheckIn).where(CheckIn.patient_id == p.patient_id).order_by(CheckIn.submitted_at.desc()).limit(14)).scalars()
    return {"symptom_options": SYMPTOMS,
            "items": [{"submitted_at": c.submitted_at, "feeling": c.feeling, "symptoms": [s for s in c.symptoms.split(",") if s],
                       "took_medications": c.took_medications, "notes": c.notes} for c in rows]}


@router.post("/checkins")
def submit_checkin(body: CheckInIn, db: Session = Depends(get_db), user: User = Depends(patient_only)):
    bad = [s for s in body.symptoms if s not in SYMPTOMS]
    if bad:
        raise HTTPException(422, "Unknown symptom")
    p = _me(db, user)
    c = CheckIn(patient_id=p.patient_id, submitted_at=datetime.now(timezone.utc), feeling=body.feeling,
                symptoms=",".join(s for s in body.symptoms if s != "None"), took_medications=body.took_medications,
                notes=body.notes, source="mobile")
    db.add(c)
    audit.record(db, user, "patient_checkin", "patient", p.patient_id)
    db.commit()
    urgent = bool(URGENT & set(body.symptoms))
    return {"ok": True, "submitted_at": c.submitted_at,
            "message": ("Thank you. Your care team can see this check-in. If you have chest discomfort or trouble breathing "
                        "right now, call emergency services.") if urgent else "Thank you. Your care team can see this check-in."}


@router.get("/coaching")
def coaching(db: Session = Depends(get_db), user: User = Depends(patient_only)):
    """Simple, non-clinical engagement messages (no diagnosis, no medication advice)."""
    p = _me(db, user)
    week = datetime.now(timezone.utc) - timedelta(days=7)
    n = len(db.execute(select(CheckIn.checkin_id).where(CheckIn.patient_id == p.patient_id, CheckIn.submitted_at > week)).all())
    dev = db.get(Device, p.device_id)
    tips = [f"You have completed {n} check-in{'s' if n != 1 else ''} this week. Daily check-ins help your care team."]
    if dev and dev.battery_pct is not None and dev.battery_pct < 30:
        tips.append(f"Your {dev.device_type.lower()} battery is at {dev.battery_pct}%. Please charge it today.")
    if dev and dev.last_sync_at and datetime.now(timezone.utc) - dev.last_sync_at > timedelta(hours=2):
        tips.append("Your device has not synced for a while. Keep your phone nearby with Bluetooth on.")
    tips.append("A short walk, if your care team has said it is fine for you, is a good way to start the day.")
    return {"messages": tips, "disclaimer": "These reminders do not replace advice from your care team."}
