"""Heart Angel: a care-team chat box that answers questions FROM THE RECORD (synthetic data).

Patient summaries, current medications, doctor in charge, family contact, emergencies right now (critical alarms + doctor on
call), who is on a medication / has a condition, stable vs at-risk vs deceased counts.

It never makes clinical decisions: dosing, starting/stopping treatment or diagnosing are routed to the doctor in charge or
the doctor on call. Answers are deterministic lookups (no LLM), so every name and number comes straight from the database.
"""
from __future__ import annotations

import re
from datetime import timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import analytics, audit
from . import domain as d
from . import knowledge as kb
from .auth import User, require
from .db import get_db
from .models import Alarm, CardiacMeasurement, Device, Diagnosis, Medication, Patient, Treatment

router = APIRouter(prefix="/api/heartangel", tags=["heart angel"])

DECISION = re.compile(
    r"(should (i|we|he|she|they)\b|what dose|which dose|how much .*(give|take)|(increase|decrease|double|lower|raise) (the |his |her |their )?(dose|dosage)|stop (the|his|her|their)|"
    r"start (him|her|them)|switch (him|her|them|to)|prescribe|is it safe to|can (i|we) give|diagnos(e|is) (him|her|them|this))", re.I)
EMERGENCY = re.compile(r"\b(emergenc\w*|urgent|critical|code blue|crash|arrest|right now|help now|who needs help)\b", re.I)
PID = re.compile(r"\bP\d{5}\b", re.I)


class AskIn(BaseModel):
    question: str = Field(min_length=2, max_length=500)


def _now():
    return analytics.frames().now.to_pydatetime()


def _on_call(now) -> str:
    shift = d.shift_of(now.hour)
    n = (now - timedelta(hours=7)).toordinal() * 3 + [s[0] for s in d.SHIFTS].index(shift)
    return f"{d.ON_CALL_ROTA[n % len(d.ON_CALL_ROTA)]} ({shift} shift)"


def _ref(p: Patient) -> dict:
    return {"patient_id": p.patient_id, "synthetic_name": p.synthetic_name}


def _find_patients(db: Session, q: str) -> list[Patient]:
    ids = {m.upper() for m in PID.findall(q)}
    if ids:
        return list(db.scalars(select(Patient).where(Patient.patient_id.in_(ids))))
    ql = q.lower()
    hits = [p for p in db.scalars(select(Patient)) if p.synthetic_name.lower() in ql]
    hits.sort(key=lambda p: (p.monitoring_status != "active", p.patient_id))
    return hits


def _current(rows, start_attr: str, end_attr: str, now):
    return [r for r in rows if getattr(r, start_attr) <= now and (getattr(r, end_attr) is None or getattr(r, end_attr) > now)]


def _patient_answer(db: Session, p: Patient, q: str, now) -> str:
    ql = q.lower()
    end = p.monitoring_end or now
    dx = [x.pathology_name for x in db.scalars(select(Diagnosis).where(Diagnosis.patient_id == p.patient_id))
          if x.diagnosis_date <= end and (x.resolved_date is None or x.resolved_date > end)]
    meds = _current(db.scalars(select(Medication).where(Medication.patient_id == p.patient_id)).all(), "start_time", "end_time", end)
    txs = _current(db.scalars(select(Treatment).where(Treatment.patient_id == p.patient_id)).all(), "start_date", "end_date", end)
    active = db.scalars(select(Alarm).where(Alarm.patient_id == p.patient_id, Alarm.resolved_at.is_(None))
                        .order_by(Alarm.triggered_at.desc())).all()
    hr = db.scalars(select(CardiacMeasurement).where(CardiacMeasurement.patient_id == p.patient_id,
                                                     CardiacMeasurement.measurement_type == "heart_rate")
                    .order_by(CardiacMeasurement.observed_at.desc()).limit(1)).first()
    devs = db.scalars(select(Device).where(Device.patient_id == p.patient_id, Device.status == "in_use")).all()
    doctor = d.TEAM_DOCTOR.get(p.assigned_care_team, "—")
    age = d.age_on(p.date_of_birth, p.admission_date)
    status = "monitored now" if p.monitoring_status == "active" else (p.discharge_outcome or "discharged").lower()
    contact = (f"{p.family_contact_name} ({p.family_contact_relation}) · {p.family_contact_phone}"
               if p.family_contact_name else "not recorded")
    med_txt = "; ".join(f"{m.medication_name} {m.prescribed_dose} {m.route}" for m in meds) or "none recorded"
    lines = {
        "who": f"**{p.synthetic_name}** ({p.patient_id}) · {age} y · {'Female' if p.sex == 'F' else 'Male'} · {p.care_unit} · {status}",
        "doctor": f"Doctor in charge: {doctor} ({p.assigned_care_team}) · on call now: {_on_call(now)}",
        "family": f"Family contact: {contact}",
        "dx": f"Conditions: {', '.join(sorted(set(dx))) or 'no active cardiac diagnosis'}",
        "meds": f"Current medications: {med_txt}",
        "tx": f"Treatments: {', '.join(sorted({t.treatment_type for t in txs})) or 'none recorded'}",
        "alarms": (f"Active alarms: {len(active)} — " + ", ".join(f"{a.alarm_type} ({a.severity}"
                   f"{', unacknowledged' if a.acknowledged_at is None else ''})" for a in active[:4])) if active else "Active alarms: none",
        "vitals": f"Latest heart rate: {round(hr.numeric_value)} bpm" if hr and hr.numeric_value is not None else "Latest heart rate: no reading",
        "devices": "Devices: " + (", ".join(f"{v.device_type} {v.device_id}" + (f" (battery {v.battery_pct}%)" if v.battery_pct is not None else "")
                                            for v in devs) or "none in use"),
    }
    focus = []
    if re.search(r"famil|contact|phone|call (the )?(family|relative)|next of kin|wife|husband|daughter|son\b", ql):
        focus += ["family"]
    if re.search(r"medic|meds|drug|pill|taking|prescri", ql):
        focus += ["meds"]
    if re.search(r"treat|therap|procedure", ql):
        focus += ["tx"]
    if re.search(r"doctor|physician|in charge|attending|on call", ql):
        focus += ["doctor"]
    if re.search(r"alarm|alert|vital|heart rate|\bhr\b|status|how is", ql):
        focus += ["alarms", "vitals"]
    if re.search(r"condition|diagnos|disease|problem", ql):
        focus += ["dx"]
    if re.search(r"device|sensor|battery|patch|ring|monitor", ql):
        focus += ["devices"]
    keys = ["who"] + (focus or ["doctor", "family", "dx", "meds", "tx", "alarms", "vitals", "devices"])
    return "\n".join(lines[k] for k in dict.fromkeys(keys))


def answer(db: Session, user: User, q: str) -> dict:
    now = _now()
    patients = _find_patients(db, q)

    if DECISION.search(q):
        who = ""
        if patients:
            p = patients[0]
            who = f" For {p.synthetic_name}, the doctor in charge is {d.TEAM_DOCTOR.get(p.assigned_care_team, '—')}."
        return {"intent": "clinical_decision", "patients": [_ref(p) for p in patients[:5]], "answer":
                "I can show what is in the record, but dosing, starting or stopping treatment and diagnosis are decisions for the "
                f"physician.{who} Doctor on call now: {_on_call(now)}. In an emergency follow your hospital's rapid-response protocol."}

    if EMERGENCY.search(q) and not patients:
        crit = db.execute(select(Alarm, Patient).join(Patient, Patient.patient_id == Alarm.patient_id)
                          .where(Alarm.resolved_at.is_(None), Alarm.severity == "critical")
                          .order_by(Alarm.acknowledged_at.is_not(None), Alarm.triggered_at)).all()
        seen: set[tuple[str, str]] = set()
        crit = [(a, p) for a, p in crit if (p.patient_id, a.alarm_type) not in seen and not seen.add((p.patient_id, a.alarm_type))]
        if not crit:
            body = "No unresolved critical alarms right now."
        else:
            body = f"{len(crit)} unresolved critical alarm(s):\n" + "\n".join(
                f"• **{p.synthetic_name}** ({p.patient_id}) · {p.care_unit} · {a.alarm_type}"
                f"{' · UNACKNOWLEDGED' if a.acknowledged_at is None else ''} · nurse {a.assigned_nurse} · "
                f"doctor {d.TEAM_DOCTOR.get(p.assigned_care_team, '—')} · family {p.family_contact_phone or '—'}"
                for a, p in crit[:8])
        refs = list({p.patient_id: _ref(p) for _, p in crit[:8]}.values())
        return {"intent": "emergency", "patients": refs, "answer":
                f"{body}\nDoctor on call: {_on_call(now)}. Heart Angel does not replace calling the rapid-response team."}

    if patients:
        extra = f"\n({len(patients) - 1} more patient(s) match that name.)" if len(patients) > 1 else ""
        return {"intent": "patient", "patients": [_ref(p) for p in patients[:5]],
                "answer": _patient_answer(db, patients[0], q, now) + extra}

    ql = q.lower()
    if re.search(r"on call|on-call", ql):
        return {"intent": "on_call", "patients": [], "answer": f"Doctor on call now: {_on_call(now)}. Doctors in charge: " +
                ", ".join(f"{doc} ({team})" for team, doc in d.TEAM_DOCTOR.items()) + "."}

    names = {n.lower(): cls for cls, items in d.MEDICATIONS.items() for n, _, _ in items}
    med_hit = next((n for n in names if n in ql), None) or next((c for c in d.MEDICATIONS if c.lower().rstrip("s") in ql), None)
    if med_hit:
        rows = db.execute(select(Medication, Patient).join(Patient, Patient.patient_id == Medication.patient_id)
                          .where(Patient.monitoring_status == "active", Medication.start_time <= now,
                                 (Medication.end_time.is_(None)) | (Medication.end_time > now))).all()
        hits = {p.patient_id: (p, m) for m, p in rows if (m.medication_name if med_hit in names else m.medication_class).lower() == med_hit.lower()}
        label = med_hit.title() if med_hit in names else med_hit
        lst = "\n".join(f"• **{p.synthetic_name}** ({p.patient_id}) · {m.medication_name} {m.prescribed_dose} · {p.care_unit}"
                        for p, m in list(hits.values())[:12])
        return {"intent": "medication", "patients": [_ref(p) for p, _ in list(hits.values())[:12]],
                "answer": f"{len(hits)} monitored patient(s) currently on {label}." + (f"\n{lst}" if lst else "") +
                ("\n(showing 12)" if len(hits) > 12 else "")}

    cond = next((c for c in d.PATHOLOGIES if c.lower() in ql or (c == "Atrial fibrillation" and "afib" in ql)), None)
    if cond:
        rows = db.execute(select(Patient).join(Diagnosis, Diagnosis.patient_id == Patient.patient_id)
                          .where(Patient.monitoring_status == "active", Diagnosis.pathology_name == cond,
                                 Diagnosis.active_status.is_(True), Diagnosis.diagnosis_date <= now)).scalars().unique().all()
        lst = "\n".join(f"• **{p.synthetic_name}** ({p.patient_id}) · {p.care_unit} · {d.TEAM_DOCTOR.get(p.assigned_care_team, '—')}"
                        for p in rows[:12])
        return {"intent": "condition", "patients": [_ref(p) for p in rows[:12]],
                "answer": f"{len(rows)} monitored patient(s) with {cond}." + (f"\n{lst}" if lst else "") + ("\n(showing 12)" if len(rows) > 12 else "")}

    if re.search(r"risk|deceased|died|death|stable|healthy|how many patients", ql):
        c = analytics.status_mix(analytics.frames(), {})["counts"]
        return {"intent": "status", "patients": [], "answer":
                f"Registry (90 days): {c['Stable / recovered']} stable / recovered, {c['At risk']} at risk (alarm-based), "
                f"{c['Deceased']} deceased. See the Patients page for the breakdown by condition, medication, age, sex and doctor."}

    return {"intent": "help", "patients": [], "answer":
            "Ask me about a patient by name or ID (medications, family contact, doctor in charge, alarms), "
            "'any emergencies?', 'who is on apixaban?', 'patients with heart failure', 'who is on call?', "
            "or 'how many patients are at risk?'."}


@router.post("/ask")
def ask(body: AskIn, db: Session = Depends(get_db), user: User = Depends(require("view_clinical"))):
    out = answer(db, user, body.question)
    audit.record(db, user, "heartangel_ask", "heartangel", out["intent"],
                 f"q={kb.redact(body.question)[0][:200]}; patients={[p['patient_id'] for p in out['patients']]}")
    db.commit()
    return out
