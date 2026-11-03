"""Core REST API: auth, dashboard, patients, alarms, ingestion, simulator, live stream, settings, audit."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, available_timezones

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from . import analytics, audit, integration, settings_store
from . import domain as d
from .auth import DEMO_USERS, PERMISSIONS, User, current_user, issue_token, require
from .db import get_db
from .ingest import create_alarm, ingest_measurement
from .models import (Alarm, AuditLog, CardiacMeasurement, ClinicalReview, Device, Diagnosis, IntegrationEvent, Medication,
                     Patient, Treatment)
from .schemas import AckIn, ConsultIn, LoginIn, MeasurementIn, ResolveIn, SettingsPatch, SimulatorConfig
from .seed import INJECTED_PATTERNS, OUTCOME_PATTERNS
from .simulator import bus, simulator

router = APIRouter(prefix="/api")

DISCLAIMER = ("Synthetic demonstration data only. Not a medical device; findings are descriptive associations, "
              "not clinically validated, and do not establish causation or treatment effects.")
TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto",
             "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney", "UTC"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------------------------------- auth & meta
@router.get("/auth/users", tags=["auth"])
def demo_users():
    return [{"username": k, **v} for k, v in DEMO_USERS.items()]


@router.post("/auth/login", tags=["auth"])
def login(body: LoginIn):
    if body.username not in DEMO_USERS:
        raise HTTPException(401, "Unknown demo user")
    u = DEMO_USERS[body.username]
    return {"access_token": issue_token(body.username), "token_type": "bearer",
            "user": {"username": body.username, **u},
            "permissions": sorted(p for p, roles in PERMISSIONS.items() if u["role"] in roles)}


@router.get("/auth/me", tags=["auth"])
def me(user: User = Depends(current_user)):
    return {**user.model_dump(), "permissions": sorted(p for p, r in PERMISSIONS.items() if user.role in r)}


@router.get("/meta", tags=["meta"])
def meta():
    return {
        "product": "CardioWatch AI",
        "disclaimer": DISCLAIMER,
        "age_groups": d.AGE_GROUPS, "pathologies": list(d.PATHOLOGIES), "medication_classes": d.MEDICATION_CLASSES,
        "treatments": d.TREATMENTS, "care_units": d.CARE_UNITS, "alarm_types": d.ALARM_TYPES,
        "severities": d.SEVERITIES, "dispositions": d.DISPOSITIONS, "timezones": TIMEZONES,
        "shifts": [{"name": n, "start_hour": s, "end_hour": e} for n, s, e in d.SHIFTS],
        "injected_patterns": INJECTED_PATTERNS,
        "injected_outcome_patterns": OUTCOME_PATTERNS,
        "device_types": list(d.DEVICE_TYPES),
        "device_info": d.DEVICE_INFO,
        "technical_alarms": sorted(d.TECHNICAL_ALARMS),
    }


# ------------------------------------------------------------------------------------------- dashboard
@router.get("/dashboard/summary", tags=["dashboard"])
def dashboard_summary(user: User = Depends(require("view_clinical"))):
    return {**analytics.summary(analytics.frames()), "disclaimer": DISCLAIMER}


# ------------------------------------------------------------------------------------------- patients
@router.get("/patients", tags=["patients"])
def list_patients(
    search: str | None = Query(None, max_length=60),
    unit: str | None = None,
    age_group: str | None = None,
    status: str | None = Query(None, pattern="^(active|discharged)$"),
    pathology: str | None = None,
    sort: str = Query("alarms_24h", pattern="^(alarms_24h|alarms_total|active_alarms|age|admission_date|patient_id)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: User = Depends(require("view_clinical")),
):
    F = analytics.frames()
    p = F.patients
    if search:
        s = search.lower()
        p = p[p["patient_id"].str.lower().str.contains(s, regex=False) | p["synthetic_name"].str.lower().str.contains(s, regex=False)]
    if unit:
        p = p[p["care_unit"] == unit]
    if age_group:
        p = p[p["age_group"] == age_group]
    if status:
        p = p[p["monitoring_status"] == status]
    dg = F.intervals["pathology"]
    current_dx = dg[(dg["start"] <= F.now) & (dg["end"] > F.now)].groupby("patient_id")["key"].apply(lambda x: sorted(set(x)))
    if pathology:
        p = p[p["patient_id"].isin(current_dx[current_dx.apply(lambda x: pathology in x)].index)]
    a = F.alarms
    counts = pd.DataFrame({
        "alarms_total": a.groupby("patient_id").size(),
        "alarms_24h": a[a["triggered_at"] >= F.now - pd.Timedelta(hours=24)].groupby("patient_id").size(),
        "active_alarms": a[a["resolved_at"].isna()].groupby("patient_id").size(),
    })
    p = p.join(counts, on="patient_id").fillna({"alarms_total": 0, "alarms_24h": 0, "active_alarms": 0})
    p = p.sort_values(sort, ascending=sort in ("patient_id",))
    total = len(p)
    page_rows = p.iloc[(page - 1) * page_size: page * page_size]
    items = [{
        "patient_id": r.patient_id, "synthetic_name": r.synthetic_name, "age": int(r.age), "age_group": r.age_group,
        "sex": r.sex, "care_unit": r.care_unit, "monitoring_status": r.monitoring_status,
        "admission_date": r.start.isoformat(), "monitoring_end": None if r.monitoring_status == "active" else r.end.isoformat(),
        "device_type": r.device_type, "diagnoses": current_dx.get(r.patient_id, []),
        "discharge_outcome": r.discharge_outcome if isinstance(r.discharge_outcome, str) else None,
        "alarms_total": int(r.alarms_total), "alarms_24h": int(r.alarms_24h), "active_alarms": int(r.active_alarms),
    } for r in page_rows.itertuples()]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


def _get_patient(db: Session, patient_id: str) -> Patient:
    if not (len(patient_id) == 6 and patient_id.startswith("P") and patient_id[1:].isdigit()):
        raise HTTPException(422, "Invalid patient id")
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


def _alarm_dict(a: Alarm) -> dict:
    return {c: getattr(a, c) for c in (
        "alarm_id", "patient_id", "measurement_id", "alarm_type", "severity", "trigger_value", "trigger_unit",
        "triggered_at", "received_at", "acknowledged_at", "acknowledged_by", "resolved_at", "assigned_nurse",
        "clinical_review_status", "source", "simulated_flag")}


@router.get("/patients/{patient_id}", tags=["patients"])
def patient_detail(patient_id: str, db: Session = Depends(get_db), user: User = Depends(require("view_clinical"))):
    p = _get_patient(db, patient_id)
    now = _now()
    age = d.age_on(p.date_of_birth, p.admission_date)
    dx = db.execute(select(Diagnosis).where(Diagnosis.patient_id == patient_id).order_by(Diagnosis.diagnosis_date)).scalars().all()
    meds = db.execute(select(Medication).where(Medication.patient_id == patient_id).order_by(Medication.start_time)).scalars().all()
    tx = db.execute(select(Treatment).where(Treatment.patient_id == patient_id).order_by(Treatment.start_date)).scalars().all()
    reviews = db.execute(select(ClinicalReview).where(ClinicalReview.patient_id == patient_id)
                         .order_by(ClinicalReview.review_timestamp.desc())).scalars().all()
    recent = db.execute(select(Alarm).where(Alarm.patient_id == patient_id, Alarm.triggered_at >= now - timedelta(hours=24))).scalars().all()
    totals = db.execute(select(func.count(), func.count(Alarm.resolved_at), func.count().filter(Alarm.severity == "critical"))
                        .where(Alarm.patient_id == patient_id)).one()
    audit.record(db, user, "view_patient_record", "patient", patient_id)
    db.commit()
    end = p.monitoring_end or now
    return {
        "patient_id": p.patient_id, "synthetic_name": p.synthetic_name, "date_of_birth": p.date_of_birth,
        "age": age, "age_group": d.age_group(age), "sex": p.sex, "admission_date": p.admission_date,
        "monitoring_end": p.monitoring_end, "monitoring_days": round((end - p.admission_date).total_seconds() / 86400, 1),
        "care_unit": p.care_unit, "monitoring_status": p.monitoring_status, "discharge_outcome": p.discharge_outcome,
        "assigned_care_team": p.assigned_care_team,
        "device_id": p.device_id, "device_type": p.device_type,
        "device": _device_dict(dev, now) if (dev := db.get(Device, p.device_id)) else None,
        "diagnoses": [{"diagnosis_id": x.diagnosis_id, "diagnosis_code": x.diagnosis_code, "pathology_name": x.pathology_name,
                       "diagnosis_date": x.diagnosis_date, "resolved_date": x.resolved_date, "active_status": x.active_status} for x in dx],
        "medications": [{"medication_id": m.medication_id, "medication_name": m.medication_name, "medication_class": m.medication_class,
                         "prescribed_dose": m.prescribed_dose, "route": m.route, "start_time": m.start_time,
                         "end_time": m.end_time, "status": m.status} for m in meds],
        "treatments": [{"treatment_id": t.treatment_id, "treatment_type": t.treatment_type, "start_date": t.start_date,
                        "end_date": t.end_date, "status": t.status} for t in tx],
        "reviews": [{"review_id": r.review_id, "alarm_id": r.alarm_id, "reviewer": r.reviewer, "review_timestamp": r.review_timestamp,
                     "disposition": r.disposition, "notes": r.notes} for r in reviews[:100]],
        "alarm_totals": {"total": totals[0], "resolved": totals[1], "critical": totals[2]},
        "attention": analytics.attention_indicator([_alarm_dict(a) for a in recent], now) if p.monitoring_status == "active" else None,
        "synthetic": True,
    }


@router.get("/patients/{patient_id}/measurements", tags=["patients"])
def patient_measurements(patient_id: str, hours: int = Query(72, ge=1, le=2400),
                         measurement_type: str | None = Query(None, pattern="^(heart_rate|systolic_bp|diastolic_bp|spo2|sleep_hours)$"),
                         db: Session = Depends(get_db), user: User = Depends(require("view_clinical"))):
    p = _get_patient(db, patient_id)
    end = p.monitoring_end or _now()
    q = select(CardiacMeasurement).where(CardiacMeasurement.patient_id == patient_id,
                                         CardiacMeasurement.observed_at >= end - timedelta(hours=hours),
                                         CardiacMeasurement.observed_at <= end)
    if measurement_type:
        q = q.where(CardiacMeasurement.measurement_type == measurement_type)
    rows = db.execute(q.order_by(CardiacMeasurement.observed_at)).scalars().all()
    quality: dict[str, int] = {}
    for m in rows:
        quality[m.quality_status] = quality.get(m.quality_status, 0) + 1
    return {
        "patient_id": patient_id, "window_end": end, "hours": hours, "units": d.MEASUREMENT_UNITS, "quality_counts": quality,
        "items": [{"measurement_id": m.measurement_id, "measurement_type": m.measurement_type, "numeric_value": m.numeric_value,
                   "unit": m.unit, "observed_at": m.observed_at, "received_at": m.received_at,
                   "latency_seconds": round((m.received_at - m.observed_at).total_seconds()), "quality_status": m.quality_status,
                   "device_id": m.device_id} for m in rows],
    }


@router.get("/patients/{patient_id}/alarms", tags=["patients"])
def patient_alarms(patient_id: str, limit: int = Query(300, ge=1, le=2000),
                   db: Session = Depends(get_db), user: User = Depends(require("view_clinical"))):
    _get_patient(db, patient_id)
    rows = db.execute(select(Alarm).where(Alarm.patient_id == patient_id).order_by(Alarm.triggered_at.desc()).limit(limit)).scalars().all()
    return {"patient_id": patient_id, "items": [_alarm_dict(a) for a in rows]}


# ------------------------------------------------------------------------------------------- alarms
def _enrich(db: Session, rows: list[tuple[Alarm, Patient]]) -> list[dict]:
    now = _now()
    pids = list({p.patient_id for _, p in rows})
    if not pids:
        return []
    dx: dict[str, list[str]] = {}
    for pid, name in db.execute(select(Diagnosis.patient_id, Diagnosis.pathology_name)
                                .where(Diagnosis.patient_id.in_(pids), Diagnosis.active_status.is_(True),
                                       Diagnosis.diagnosis_date <= now)):
        dx.setdefault(pid, []).append(name)
    latest = {(pid, mt): (v, u, ts) for pid, mt, v, u, ts in db.execute(text(
        "SELECT DISTINCT ON (patient_id, measurement_type) patient_id, measurement_type, numeric_value, unit, observed_at "
        "FROM cardiac_measurements WHERE patient_id = ANY(:ids) AND numeric_value IS NOT NULL "
        "AND quality_status IN ('valid','delayed') AND observed_at > :since "
        "ORDER BY patient_id, measurement_type, observed_at DESC"), {"ids": pids, "since": now - timedelta(days=2)})}
    recent: dict[str, list[dict]] = {}
    for a in db.execute(select(Alarm).where(Alarm.patient_id.in_(pids), Alarm.triggered_at >= now - timedelta(hours=24))).scalars():
        recent.setdefault(a.patient_id, []).append(_alarm_dict(a))
    out = []
    for a, p in rows:
        mtype = d.ALARM_MEASUREMENT.get(a.alarm_type) or "heart_rate"
        cur = latest.get((p.patient_id, mtype))
        age = d.age_on(p.date_of_birth, p.admission_date)
        unacked_min = None if a.acknowledged_at else round((now - a.triggered_at).total_seconds() / 60, 1)
        out.append({
            **_alarm_dict(a),
            "synthetic_name": p.synthetic_name, "age": age, "age_group": d.age_group(age), "care_unit": p.care_unit,
            "diagnoses": sorted(set(dx.get(p.patient_id, []))),
            "current_measurement": {"measurement_type": mtype, "value": cur[0], "unit": cur[1], "observed_at": cur[2]} if cur else None,
            "minutes_unacknowledged": unacked_min,
            "attention": analytics.attention_indicator(recent.get(p.patient_id, [_alarm_dict(a)]), now)
            if a.resolved_at is None else None,
        })
    return out


@router.get("/alarms", tags=["alarms"])
def list_alarms(
    status: str = Query("active", pattern="^(active|unacknowledged|acknowledged|resolved|all)$"),
    severity: list[str] = Query(default=[]),
    unit: list[str] = Query(default=[]),
    alarm_type: list[str] = Query(default=[]),
    nurse: str | None = Query(None, max_length=60),
    search: str | None = Query(None, max_length=60),
    hours: int | None = Query(None, ge=1, le=2400),
    sort: str = Query("priority", pattern="^(priority|newest|oldest|severity|attention)$"),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(require("view_clinical")),
):
    _validate(severity, d.SEVERITIES, "severity")
    _validate(unit, d.CARE_UNITS, "unit")
    _validate(alarm_type, d.ALARM_TYPES, "alarm_type")
    q = select(Alarm, Patient).join(Patient, Patient.patient_id == Alarm.patient_id)
    if status == "active":
        q = q.where(Alarm.resolved_at.is_(None))
    elif status == "unacknowledged":
        q = q.where(Alarm.resolved_at.is_(None), Alarm.acknowledged_at.is_(None))
    elif status == "acknowledged":
        q = q.where(Alarm.resolved_at.is_(None), Alarm.acknowledged_at.is_not(None))
    elif status == "resolved":
        q = q.where(Alarm.resolved_at.is_not(None))
    if severity:
        q = q.where(Alarm.severity.in_(severity))
    if unit:
        q = q.where(Patient.care_unit.in_(unit))
    if alarm_type:
        q = q.where(Alarm.alarm_type.in_(alarm_type))
    if nurse:
        q = q.where(Alarm.assigned_nurse == nurse)
    if search:
        like = f"%{search}%"
        q = q.where(Patient.patient_id.ilike(like) | Patient.synthetic_name.ilike(like))
    if hours:
        q = q.where(Alarm.triggered_at >= _now() - timedelta(hours=hours))
    q = q.order_by(Alarm.triggered_at.asc() if sort == "oldest" else Alarm.triggered_at.desc()).limit(limit)
    items = _enrich(db, db.execute(q).all())
    if sort == "priority":  # source severity first, then unacknowledged first, then oldest
        items.sort(key=lambda x: (-d.SEVERITY_RANK[x["severity"]], x["acknowledged_at"] is not None, x["triggered_at"]))
    elif sort == "severity":
        items.sort(key=lambda x: (-d.SEVERITY_RANK[x["severity"]], -x["triggered_at"].timestamp()))
    elif sort == "attention":
        items.sort(key=lambda x: -(x["attention"]["score"] if x["attention"] else -1))
    return {"total": len(items), "items": items, "as_of": _now()}


def _validate(values: list[str], allowed: list[str], name: str):
    bad = [v for v in values if v not in allowed]
    if bad:
        raise HTTPException(422, f"Unknown {name}: {', '.join(bad)}")


def _get_alarm(db: Session, alarm_id: int) -> Alarm:
    a = db.get(Alarm, alarm_id, with_for_update=True)
    if not a:
        raise HTTPException(404, "Alarm not found")
    return a


@router.post("/alarms/{alarm_id}/acknowledge", tags=["alarms"])
def acknowledge(alarm_id: int, body: AckIn | None = None, db: Session = Depends(get_db),
                user: User = Depends(require("acknowledge_alarm"))):
    a = _get_alarm(db, alarm_id)
    if a.acknowledged_at is not None:
        raise HTTPException(409, "Alarm already acknowledged")
    a.acknowledged_at = _now()
    a.acknowledged_by = user.display_name
    a.clinical_review_status = "acknowledged"
    audit.record(db, user, "acknowledge_alarm", "alarm", alarm_id,
                 f"patient={a.patient_id}" + (f"; note={body.note}" if body and body.note else ""))
    integration.emit(db, "alarm.acknowledged", {"alarm_id": alarm_id, "patient_id": a.patient_id,
                                                "acknowledged_by": user.username})
    db.commit()
    analytics.invalidate()
    bus.publish("alarm_updated", {"alarm_id": alarm_id, "status": "acknowledged"})
    return _alarm_dict(a)


@router.post("/alarms/{alarm_id}/resolve", tags=["alarms"])
def resolve(alarm_id: int, body: ResolveIn, db: Session = Depends(get_db), user: User = Depends(require("review_alarm"))):
    a = _get_alarm(db, alarm_id)
    if a.resolved_at is not None:
        raise HTTPException(409, "Alarm already resolved")
    now = _now()
    if a.acknowledged_at is None:
        a.acknowledged_at = now
        a.acknowledged_by = user.display_name
        audit.record(db, user, "acknowledge_alarm", "alarm", alarm_id, f"patient={a.patient_id}; via resolve")
    a.resolved_at = now
    a.clinical_review_status = "reviewed"
    db.add(ClinicalReview(patient_id=a.patient_id, alarm_id=a.alarm_id, reviewer=user.display_name,
                          review_timestamp=now, disposition=body.disposition, notes=body.notes))
    audit.record(db, user, "resolve_alarm", "alarm", alarm_id, f"patient={a.patient_id}; disposition={body.disposition}")
    db.commit()
    analytics.invalidate()
    bus.publish("alarm_updated", {"alarm_id": alarm_id, "status": "reviewed"})
    return _alarm_dict(a)


@router.post("/alarms/{alarm_id}/consult-request", tags=["alarms", "integration"])
def consult_request(alarm_id: int, body: ConsultIn, db: Session = Depends(get_db),
                    user: User = Depends(require("review_alarm"))):
    """Ask the connected virtual-care platform to open a video consult for this alarm (integration outbox event)."""
    a = db.get(Alarm, alarm_id)
    if not a:
        raise HTTPException(404, "Alarm not found")
    integration.emit(db, "consult.requested", {
        "alarm_id": a.alarm_id, "patient_id": a.patient_id, "alarm_type": a.alarm_type, "severity": a.severity,
        "urgency": body.urgency, "requested_by": user.username, "requested_role": user.role})
    audit.record(db, user, "request_virtual_consult", "alarm", alarm_id, f"patient={a.patient_id}; urgency={body.urgency}")
    db.commit()
    bus.publish("alarm_updated", {"alarm_id": alarm_id, "status": "consult_requested"})
    return {"alarm_id": alarm_id, "status": "consult_requested", "target": integration.TARGET}


@router.get("/integration/events", tags=["integration"])
def integration_events(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db),
                       user: User = Depends(require("view_analytics"))):
    rows = db.execute(select(IntegrationEvent).order_by(IntegrationEvent.event_id.desc()).limit(limit)).scalars().all()
    pending = db.execute(select(func.count()).where(IntegrationEvent.status == "pending")).scalar()
    return {"pending": pending, "target": integration.TARGET, "items": [
        {"event_id": e.event_id, "event_type": e.event_type, "occurred_at": e.occurred_at, "target": e.target,
         "payload": json.loads(e.payload), "status": e.status, "delivered_at": e.delivered_at} for e in rows]}


# ------------------------------------------------------------------------------------------- devices
def _device_dict(dv: Device, now: datetime) -> dict:
    info = d.DEVICE_INFO.get(dv.device_type, {})
    since = None if dv.last_sync_at is None else (now - dv.last_sync_at).total_seconds() / 60
    if dv.status != "in_use":
        health = "returned"
    elif since is not None and since > info.get("offline_after_min", 60):
        health = "offline"
    elif dv.battery_pct is not None and dv.battery_pct < 20:
        health = "low_battery"
    else:
        health = "online"
    return {"device_id": dv.device_id, "device_type": dv.device_type, "model": dv.model,
            "firmware_version": dv.firmware_version, "connectivity": dv.connectivity, "battery_pct": dv.battery_pct,
            "last_sync_at": dv.last_sync_at, "minutes_since_sync": None if since is None else round(since, 1),
            "offline_after_min": info.get("offline_after_min"), "status": dv.status, "health": health,
            "patient_id": dv.patient_id, "signals": info.get("signals", []), "wearable": dv.device_type in d.WEARABLES}


@router.get("/device-profiles", tags=["devices"])
def device_profiles(user: User = Depends(require("view_clinical"))):
    """Product templates: what each device type measures (LOINC/UCUM), which alarm rules apply, when it counts as offline."""
    out = []
    for name, info in d.DEVICE_INFO.items():
        rules = []
        for atype in info["alarms"]:
            bands = d.THRESHOLD_BANDS.get(atype)
            src = d.ALARM_MEASUREMENT.get(atype)
            rules.append({"alarm_type": atype, "signal": src, "technical": atype in d.TECHNICAL_ALARMS,
                          "bands": {k: list(v) for k, v in bands.items()} if bands else None,
                          "source": "threshold rule" if bands else "device event"})
        out.append({"device_type": name, "code": d.DEVICE_TYPES[name], "model": info["model"],
                    "connectivity": info["connectivity"], "battery_powered": info["battery"],
                    "offline_after_min": info["offline_after_min"], "firmware_versions": info["firmware"],
                    "signals": [{"key": s, **{k: v for k, v in d.SIGNALS[s].items() if k != "range"},
                                 "valid_range": list(d.SIGNALS[s]["range"])} for s in info["signals"]],
                    "alarm_rules": rules})
    return out


@router.get("/devices", tags=["devices"])
def list_devices(device_type: str | None = None, health: str | None = Query(None, pattern="^(online|offline|low_battery)$"),
                 unit: str | None = None, db: Session = Depends(get_db), user: User = Depends(require("view_clinical"))):
    """Fleet of devices assigned to currently monitored patients, with derived connectivity/battery health."""
    if device_type and device_type not in d.DEVICE_TYPES:
        raise HTTPException(422, "Unknown device type")
    if unit and unit not in d.CARE_UNITS:
        raise HTTPException(422, "Unknown unit")
    q = select(Device, Patient).join(Patient, Patient.patient_id == Device.patient_id).where(Device.status == "in_use")
    if device_type:
        q = q.where(Device.device_type == device_type)
    if unit:
        q = q.where(Patient.care_unit == unit)
    now = _now()
    items = []
    for dv, p in db.execute(q).all():
        row = {**_device_dict(dv, now), "synthetic_name": p.synthetic_name, "care_unit": p.care_unit}
        if health and row["health"] != health:
            continue
        items.append(row)
    summary = {h: sum(1 for i in items if i["health"] == h) for h in ("online", "offline", "low_battery")}
    by_type = {}
    for i in items:
        t = by_type.setdefault(i["device_type"], {"device_type": i["device_type"], "total": 0, "online": 0, "offline": 0,
                                                  "low_battery": 0, "firmware": {}})
        t["total"] += 1
        t[i["health"]] += 1
        t["firmware"][i["firmware_version"]] = t["firmware"].get(i["firmware_version"], 0) + 1
    items.sort(key=lambda i: ({"offline": 0, "low_battery": 1, "online": 2}[i["health"]], i["device_id"]))
    return {"total": len(items), "summary": summary, "by_type": list(by_type.values()), "items": items}


# ------------------------------------------------------------------------------------------- ingestion
@router.post("/ingest/measurements", tags=["ingestion"])
def ingest(items: list[MeasurementIn], db: Session = Depends(get_db), user: User = Depends(require("control_simulator"))):
    if len(items) > 1000:
        raise HTTPException(413, "Batch too large (max 1000)")
    created = duplicates = alarms = missing = artifacts = 0
    for it in items:
        p = _get_patient(db, it.patient_id)
        mid, ok = ingest_measurement(db, p, it.measurement_type, it.value, it.observed_at, it.received_at)
        if not ok:
            duplicates += 1
            continue
        created += 1
        missing += it.value is None
        if it.value is not None and not d.in_range(it.measurement_type, it.value):
            artifacts += 1
            continue
        rule = d.evaluate_threshold(it.measurement_type, it.value)
        if rule and create_alarm(db, p, rule[0], rule[1], it.observed_at, "ingest-api", f"ingest-{mid}", mid, it.value):
            alarms += 1
    db.commit()
    analytics.invalidate()
    return {"received": len(items), "created": created, "duplicates_ignored": duplicates,
            "missing_values": missing, "artifacts_flagged": artifacts, "alarms_created": alarms}


# ------------------------------------------------------------------------------------------- simulator
@router.get("/simulator/status", tags=["simulator"])
def simulator_status(user: User = Depends(require("view_clinical"))):
    return simulator.status()


@router.post("/simulator/start", tags=["simulator"])
async def simulator_start(cfg: SimulatorConfig | None = None, db: Session = Depends(get_db),
                          user: User = Depends(require("control_simulator"))):
    if cfg:
        simulator.configure(**cfg.model_dump())
    await simulator.start()
    audit.record(db, user, "simulator_start", "simulator", "default", str(cfg.model_dump() if cfg else {}))
    db.commit()
    return simulator.status()


@router.post("/simulator/stop", tags=["simulator"])
async def simulator_stop(db: Session = Depends(get_db), user: User = Depends(require("control_simulator"))):
    await simulator.stop()
    audit.record(db, user, "simulator_stop", "simulator", "default")
    db.commit()
    return simulator.status()


# ------------------------------------------------------------------------------------------- live stream
@router.get("/stream", tags=["live"])
async def stream(request: Request, user: User = Depends(require("view_clinical"))):
    """Server-Sent Events: `alarm` (new alarm) and `alarm_updated` (acknowledged / resolved)."""
    q = bus.subscribe()

    async def gen():
        try:
            yield "retry: 3000\n\n"
            while not await request.is_disconnected():
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            bus.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------------------------------- settings & audit
@router.get("/settings", tags=["settings"])
def get_settings(user: User = Depends(current_user)):
    return settings_store.get()


@router.put("/settings", tags=["settings"])
def put_settings(patch: SettingsPatch, db: Session = Depends(get_db), user: User = Depends(require("manage_settings"))):
    data = patch.model_dump(exclude_none=True)
    if "display_timezone" in data and data["display_timezone"] not in available_timezones():
        raise HTTPException(422, "Unknown timezone")
    if "attention" in data:
        data["attention"] = {k: v for k, v in data["attention"].items() if v is not None}
    settings_store.update(data)
    analytics.reset_cache()
    audit.record(db, user, "update_settings", "settings", "global", str(data))
    db.commit()
    return settings_store.get()


@router.post("/settings/reset", tags=["settings"])
def reset_settings(db: Session = Depends(get_db), user: User = Depends(require("manage_settings"))):
    settings_store.reset()
    analytics.reset_cache()
    audit.record(db, user, "reset_settings", "settings", "global")
    db.commit()
    return settings_store.get()


@router.get("/audit/verify", tags=["audit"])
def audit_verify(db: Session = Depends(get_db), user: User = Depends(require("view_audit"))):
    """Recompute the audit hash chain; any edited or deleted entry breaks it."""
    return audit.verify(db)


@router.get("/audit", tags=["audit"])
def audit_log(limit: int = Query(100, ge=1, le=1000), resource_id: str | None = Query(None, max_length=40),
              action: str | None = Query(None, max_length=40),
              db: Session = Depends(get_db), user: User = Depends(require("view_audit"))):
    q = select(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(limit)
    if resource_id:
        q = q.where(AuditLog.resource_id == resource_id)
    if action:
        q = q.where(AuditLog.action == action)
    return [{c: getattr(r, c) for c in ("audit_id", "occurred_at", "username", "role", "action", "resource_type",
                                        "resource_id", "details")} for r in db.execute(q).scalars()]
