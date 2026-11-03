"""Reproducible synthetic data generator for CardioWatch AI.

    python -m app.seed            # seed only if the database is empty
    python -m app.seed --reset    # wipe and regenerate

Everything produced here is SYNTHETIC. Several patterns are injected on purpose so the demo
has something to find; they are listed in INJECTED_PATTERNS and in ANALYTICS_METHODS.md and
must never be read as clinical findings.

Reproducibility: same SEED_RANDOM + same SEED_ANCHOR (ISO timestamp, default = now rounded
to the minute) => identical dataset.
"""
from __future__ import annotations

import argparse
import math
import os
import random
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from sqlalchemy import text

from . import domain as d
from .config import HOSPITAL_TZ, SEED_RANDOM
from .db import engine

INJECTED_PATTERNS = [
    "Alarm hazard rises with age group (x0.7 under 50 up to x1.8 for 90+).",
    "Heart failure, tachyarrhythmia, atrial fibrillation and bradycardia add to alarm hazard.",
    "Coronary Care Unit and Post-Op Cardiac have higher alarm hazard than telemetry wards.",
    "Hourly profile: peak 06:00-09:00 local, secondary bump 18:00-20:00, quieter 12:00-14:00.",
    "Acknowledgment is slower 06:00-09:00 and at night; faster for critical alarms.",
    "While antiarrhythmics are active, HR-low and irregular-rhythm alarms are more likely.",
    "While diuretics are active, BP-low alarms are more likely.",
    "Wearable patches produce more signal-loss (technical) alarms.",
    "About 30% of alarms are followed by 1-3 repeats of the same type within 5-90 minutes.",
]

OUTCOME_PATTERNS = [
    "In-hospital mortality (completed stays only) rises with age group (x0.3 under 50 up to x3.5 for 90+).",
    "Heart failure (x2.0), tachyarrhythmia (x1.3) and atrial fibrillation (x1.2) raise synthetic mortality.",
    "Coronary Care Unit (x1.8) and Post-Op Cardiac (x1.2) stays have higher synthetic mortality.",
    "Each critical alarm during the stay adds 25% relative risk (capped at 6 alarms).",
    "Cardiac rehabilitation x0.45 — confounded by design: only patients with stays > 4 days could start rehab.",
    "Anticoagulants in atrial fibrillation x0.7; beta blockers in heart failure x0.75.",
]
MORT_AGE = [0.3, 0.5, 0.8, 1.2, 2.2, 3.5]
UNIT_MORT = {"Coronary Care Unit": 1.8, "Post-Op Cardiac": 1.2, "Cardiac Step-Down": 1.0,
             "Telemetry Ward A": 0.7, "Telemetry Ward B": 0.7}
PATH_MORT = {"Heart failure": 2.0, "Tachyarrhythmia": 1.3, "Atrial fibrillation": 1.2}

FIRST = ["Avery", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Rowan", "Sasha", "Elliot", "Noa",
         "Robin", "Kai", "Jules", "Emery", "Dakota", "Ari", "Marin", "Remy", "Sage", "Tatum",
         "Lou", "Camille", "Dominique", "Hayden", "Alexis", "Charlie", "Frankie", "Jesse", "Kendall", "Lee",
         "Micah", "Nico", "Oakley", "Parker", "Reese", "Shay", "Toni", "Val", "Wren", "Zion"]
LAST = ["Lambert", "Okonkwo", "Bergeron", "Castillo", "Nguyen", "Fischer", "Haddad", "Ivanova", "Johansson", "Kaur",
        "Leblanc", "Moreno", "Nakashima", "Oduya", "Pellerin", "Quiroga", "Rasmussen", "Sato", "Tanaka", "Ulrich",
        "Vasquez", "Walsh", "Xu", "Yilmaz", "Zielinski", "Abara", "Boucher", "Costa", "Dumont", "Eriksen",
        "Farah", "Gagnon", "Hoang", "Ibrahim", "Jensen", "Kim", "Lindgren", "Mbeki", "Novak", "Ortiz"]

AGE_WEIGHTS = [0.10, 0.15, 0.25, 0.27, 0.18, 0.05]
AGE_RANGES = [(28, 49), (50, 59), (60, 69), (70, 79), (80, 89), (90, 98)]
AGE_HAZARD = [0.7, 0.85, 1.0, 1.2, 1.55, 1.8]
UNIT_WEIGHTS = [0.15, 0.2, 0.25, 0.25, 0.15]
UNIT_HAZARD = {"Coronary Care Unit": 1.4, "Post-Op Cardiac": 1.3, "Cardiac Step-Down": 1.0,
               "Telemetry Ward A": 0.85, "Telemetry Ward B": 0.85}
PATH_HAZARD = {"Heart failure": 0.35, "Tachyarrhythmia": 0.5, "Atrial fibrillation": 0.25,
               "Bradycardia": 0.2, "Coronary artery disease": 0.0, "Hypertension": 0.0}

HOUR_W = np.array([0.8, 0.85, 1.2, 1.2, 1.1, 1.0, 1.8, 1.9, 1.8, 1.3, 1.1, 1.0,
                   0.9, 0.9, 1.0, 1.1, 1.1, 1.1, 1.3, 1.35, 1.3, 1.0, 0.85, 0.8])
HOUR_W = HOUR_W / HOUR_W.mean()
DOW_W = np.array([1.1, 1.0, 1.0, 1.0, 1.0, 0.95, 0.95])  # Mon..Sun
DOW_W = DOW_W / DOW_W.mean()

BASE_TYPE_W = {"Signal loss": 0.15, "HR high": 0.10, "HR low": 0.05, "SpO2 low": 0.12,
               "BP high": 0.08, "BP low": 0.06, "Irregular rhythm": 0.04}
PATH_TYPE_W = {
    "Atrial fibrillation": {"Irregular rhythm": 0.35, "HR high": 0.2},
    "Tachyarrhythmia": {"HR high": 0.45, "Irregular rhythm": 0.1},
    "Bradycardia": {"HR low": 0.45},
    "Heart failure": {"SpO2 low": 0.3, "BP low": 0.15},
    "Hypertension": {"BP high": 0.25},
    "Coronary artery disease": {"HR high": 0.05, "BP low": 0.05},
}
MED_TYPE_W = {
    "Antiarrhythmics": {"HR low": 0.15, "Irregular rhythm": 0.1},
    "Diuretics": {"BP low": 0.12},
    "Beta blockers": {"HR low": 0.08},
}
PATH_MEDS = {
    "Atrial fibrillation": [("Anticoagulants", 0.85), ("Beta blockers", 0.6), ("Antiarrhythmics", 0.4)],
    "Heart failure": [("Diuretics", 0.85), ("ACE inhibitors", 0.6), ("Beta blockers", 0.5)],
    "Coronary artery disease": [("Beta blockers", 0.7), ("ACE inhibitors", 0.4), ("Anticoagulants", 0.2)],
    "Bradycardia": [],
    "Tachyarrhythmia": [("Antiarrhythmics", 0.6), ("Beta blockers", 0.5)],
    "Hypertension": [("ACE inhibitors", 0.6), ("Diuretics", 0.3)],
}
PATH_PROB = {"Atrial fibrillation": (0.18, 0.06), "Heart failure": (0.12, 0.06), "Coronary artery disease": (0.35, 0.0),
             "Bradycardia": (0.08, 0.02), "Tachyarrhythmia": (0.15, 0.0), "Hypertension": (0.5, 0.0)}


def _anchor() -> datetime:
    raw = os.getenv("SEED_ANCHOR")
    if raw:
        a = datetime.fromisoformat(raw)
        return a if a.tzinfo else a.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc).replace(second=0, microsecond=0)


class Generator:
    def __init__(self, seed: int, anchor: datetime, n_patients: int = 1000, days: int = 90):
        self.r = random.Random(seed)
        self.rng = np.random.default_rng(seed)
        self.anchor = anchor
        self.start = anchor - timedelta(days=days)
        self.n = n_patients
        self.tz = ZoneInfo(HOSPITAL_TZ)
        self.patients: list[dict] = []
        self.diagnoses: list[dict] = []
        self.medications: list[dict] = []
        self.treatments: list[dict] = []
        self.measurements: dict[tuple, dict] = {}  # idempotency key -> row
        self.alarms: list[dict] = []
        self.reviews: list[dict] = []
        self.next_measurement_id = 1
        self.duplicates_dropped = 0

    # ---------------------------------------------------------------- patients & clinical context
    def build_patients(self):
        r = self.r
        for i in range(self.n):
            pid = f"P{i + 1:05d}"
            g = r.choices(range(6), AGE_WEIGHTS)[0]
            age = r.randint(*AGE_RANGES[g])
            unit = r.choices(d.CARE_UNITS, UNIT_WEIGHTS)[0]
            if r.random() < 0.17:
                adm = self.anchor - timedelta(days=r.uniform(0.3, 12))
                end = None
            else:
                los = min(max(self.rng.lognormal(math.log(4.5), 0.6), 1.0), 25.0)
                if unit == "Coronary Care Unit":
                    los *= 0.7
                adm = self.start + timedelta(days=r.uniform(0, 90 - los - 0.1))
                end = adm + timedelta(days=los)
            adm = adm.replace(microsecond=0)
            end = end.replace(microsecond=0) if end else None
            dob = adm.date().replace(day=1) - timedelta(days=365.25 * age + r.randint(0, 330))
            if unit in ("Coronary Care Unit", "Post-Op Cardiac"):
                dtype = r.choices(list(d.DEVICE_TYPES), [0.85, 0.1, 0.05])[0]
            else:
                dtype = r.choices(list(d.DEVICE_TYPES), [0.1, 0.65, 0.25])[0]
            p = dict(
                patient_id=pid,
                synthetic_name=f"{r.choice(FIRST)} {r.choice(LAST)}",
                date_of_birth=dob,
                sex=r.choice("FM"),
                admission_date=adm,
                monitoring_end=end,
                care_unit=unit,
                monitoring_status="active" if end is None else "discharged",
                assigned_care_team=r.choice(d.CARE_TEAMS),
                device_id=f"{d.DEVICE_TYPES[dtype]}-{i + 1:04d}",
                device_type=dtype,
                _age_idx=d.AGE_GROUPS.index(d.age_group(d.age_on(dob, adm))),
                _frailty=self.rng.gamma(2.0, 0.5),
            )
            self.patients.append(p)
            self._clinical_context(p)

    def _window_end(self, p) -> datetime:
        return p["monitoring_end"] or self.anchor

    def _clinical_context(self, p):
        r = self.r
        adm, end = p["admission_date"], self._window_end(p)
        los = (end - adm).total_seconds() / 86400
        paths = [name for name, (b, slope) in PATH_PROB.items() if r.random() < b + slope * p["_age_idx"]]
        if p["care_unit"] == "Post-Op Cardiac" and "Coronary artery disease" not in paths:
            paths.append("Coronary artery disease")
        if not paths:
            paths = [r.choice(list(d.PATHOLOGIES))]
        p["_paths"] = paths
        for name in paths:
            if r.random() < 0.8:
                dd = adm - timedelta(days=r.uniform(30, 3000))
            else:  # diagnosed during this stay
                dd = adm + timedelta(days=r.uniform(0, los * 0.6))
            self.diagnoses.append(dict(patient_id=p["patient_id"], diagnosis_code=d.PATHOLOGIES[name],
                                       pathology_name=name, diagnosis_date=dd.replace(microsecond=0),
                                       resolved_date=None, active_status=True))
        if r.random() < 0.06:  # historical, resolved diagnosis: must not count at event time
            name = r.choice([n for n in d.PATHOLOGIES if n not in paths] or list(d.PATHOLOGIES))
            dd = adm - timedelta(days=r.uniform(400, 2000))
            self.diagnoses.append(dict(patient_id=p["patient_id"], diagnosis_code=d.PATHOLOGIES[name],
                                       pathology_name=name, diagnosis_date=dd.replace(microsecond=0),
                                       resolved_date=(dd + timedelta(days=r.uniform(30, 300))).replace(microsecond=0),
                                       active_status=False))
        # Medications (time-bounded so analytics can use exposure at event time)
        classes: set[str] = set()
        for name in paths:
            for cls, prob in PATH_MEDS[name]:
                if r.random() < prob:
                    classes.add(cls)
        p["_meds"] = []
        for cls in sorted(classes):
            mname, dose, route = r.choice(d.MEDICATIONS[cls])
            if route == "PO" and r.random() < 0.4:
                st = adm - timedelta(days=r.uniform(30, 900))  # home medication continued
            else:
                st = adm + timedelta(days=r.uniform(0, 0.3 * los))
            if r.random() < 0.3:
                en, status = adm + timedelta(days=r.uniform(0.4, 0.9) * los), "stopped"
            elif p["monitoring_end"]:
                en, status = p["monitoring_end"], "completed"
            else:
                en, status = None, "active"
            st = st.replace(microsecond=0)
            en = en.replace(microsecond=0) if en else None
            self.medications.append(dict(patient_id=p["patient_id"], medication_name=mname, medication_class=cls,
                                         prescribed_dose=dose, route=route, start_time=st, end_time=en, status=status))
            p["_meds"].append((cls, st, en))
        # Treatments
        tlist = []
        if classes:
            tlist.append(("Medication management", adm))
        if ("Bradycardia" in paths and r.random() < 0.7) or r.random() < 0.03:
            tlist.append(("Pacemaker monitoring", adm))
        if p["care_unit"] == "Post-Op Cardiac" or ("Coronary artery disease" in paths and r.random() < 0.1):
            tlist.append(("Post-operative cardiac monitoring", adm))
        if los > 4 and r.random() < 0.35:
            tlist.append(("Cardiac rehabilitation", adm + timedelta(days=0.6 * los)))
        if any(x in paths for x in ("Atrial fibrillation", "Tachyarrhythmia")) and r.random() < 0.8 \
                or p["care_unit"] == "Coronary Care Unit" and r.random() < 0.3:
            tlist.append(("Rhythm monitoring", adm))
        if not tlist:
            tlist.append(("Rhythm monitoring", adm))
        for ttype, st in tlist:
            self.treatments.append(dict(patient_id=p["patient_id"], treatment_type=ttype,
                                        start_date=st.replace(microsecond=0), end_date=p["monitoring_end"],
                                        status="active" if p["monitoring_end"] is None else "completed"))
        # Vital-sign baselines used for routine measurements
        hr = self.rng.normal(76, 8) + (12 if "Atrial fibrillation" in paths else 0) \
            + (15 if "Tachyarrhythmia" in paths else 0) - (5 if classes & {"Beta blockers", "Antiarrhythmics"} else 0)
        if "Bradycardia" in paths:
            hr = max(46, hr - 22)
        sbp = self.rng.normal(128, 12) + (18 if "Hypertension" in paths else 0) - (10 if "Heart failure" in paths else 0)
        spo2 = min(99.5, self.rng.normal(96.5, 1.2) - (2.5 if "Heart failure" in paths else 0))
        p["_base"] = dict(heart_rate=hr, systolic_bp=sbp, diastolic_bp=sbp * 0.6 + self.rng.normal(0, 5), spo2=spo2)

    # ---------------------------------------------------------------- measurements
    def _add_measurement(self, p, mtype, value, observed_at, received_at, quality) -> int | None:
        key = (p["device_id"], mtype, observed_at)
        if key in self.measurements:
            self.duplicates_dropped += 1
            return self.measurements[key]["measurement_id"]
        mid = self.next_measurement_id
        self.next_measurement_id += 1
        self.measurements[key] = dict(
            measurement_id=mid, patient_id=p["patient_id"], device_id=p["device_id"], measurement_type=mtype,
            numeric_value=None if value is None else round(float(value), 1), unit=d.MEASUREMENT_UNITS[mtype],
            observed_at=observed_at, received_at=received_at, quality_status=quality)
        return mid

    def build_measurements(self):
        r, rng = self.r, self.rng
        sd = dict(heart_rate=6, systolic_bp=9, diastolic_bp=6, spo2=1.0)
        for p in self.patients:
            adm, end = p["admission_date"], self._window_end(p)
            coverage = r.uniform(0.65, 1.0)  # uneven monitoring coverage
            times = list(pd.date_range(adm.replace(minute=0, second=0) + timedelta(hours=1), end, freq="4h"))
            if p["monitoring_end"] is None:
                times += list(pd.date_range(max(adm, end - timedelta(hours=24)).replace(second=0), end, freq="30min"))
            for ts in times:
                if r.random() > coverage:
                    continue  # coverage gap: no reading at all
                ts = ts.to_pydatetime().replace(microsecond=0)
                hour_local = ts.astimezone(self.tz).hour
                diurnal = -4 if hour_local < 6 else 0
                for mtype in ("heart_rate", "systolic_bp", "diastolic_bp", "spo2"):
                    base = p["_base"][mtype]
                    val = rng.normal(base + (diurnal if mtype == "heart_rate" else 0), sd[mtype])
                    if mtype == "spo2":
                        val = min(val, 100)
                    q = "valid"
                    u = r.random()
                    if u < 0.03:
                        val, q = None, "missing"
                    elif u < 0.045:
                        val, q = val * r.choice([0.4, 1.8]), "artifact"
                    recv = ts + timedelta(seconds=r.randint(1, 8))
                    if r.random() < 0.04:
                        recv = ts + timedelta(minutes=r.uniform(5, 45))
                        q = "delayed" if q == "valid" else q
                    self._add_measurement(p, mtype, val, ts, recv, q)
                    if r.random() < 0.02:  # duplicated delivery of the same event
                        self._add_measurement(p, mtype, val, ts, recv, q)

    # ---------------------------------------------------------------- alarms
    def _type_weights(self, p, t: datetime) -> dict[str, float]:
        w = dict(BASE_TYPE_W)
        for path in p["_paths"]:
            for k, v in PATH_TYPE_W[path].items():
                w[k] += v
        for cls, st, en in p["_meds"]:
            if st <= t and (en is None or t < en):
                for k, v in MED_TYPE_W.get(cls, {}).items():
                    w[k] += v
        if p["device_type"] == "Wearable patch":
            w["Signal loss"] += 0.15
        return w

    def _severity(self, p, alarm_type) -> str:
        r = self.r
        if alarm_type == "Signal loss":
            return "advisory" if r.random() < 0.9 else "warning"
        if alarm_type == "Irregular rhythm":
            return "warning" if r.random() < 0.7 else "advisory"
        u = r.random()
        crit = 0.12 + 0.025 * p["_age_idx"]
        if alarm_type == "BP high":
            return "warning" if u < 0.55 else "advisory"
        if u < crit:
            return "critical"
        return "warning" if u < crit + 0.6 else "advisory"

    def _trigger_value(self, alarm_type, severity):
        if alarm_type == "Signal loss":
            return None
        if alarm_type == "Irregular rhythm":
            return round(self.r.uniform(95, 150), 0)
        lo, hi = d.THRESHOLD_BANDS[alarm_type][severity]
        lo = max(lo, {"HR high": 0, "HR low": 30, "SpO2 low": 72, "BP high": 0, "BP low": 62}[alarm_type])
        hi = min(hi, {"HR high": 178, "HR low": 250, "SpO2 low": 100, "BP high": 225, "BP low": 250}[alarm_type])
        return round(self.r.uniform(lo, hi), 0)

    def _nurse(self, p, t: datetime) -> str:
        return d.assigned_nurse(p["care_unit"], t.astimezone(self.tz))

    def build_alarms(self):
        r, rng = self.r, self.rng
        source_seq = 0
        for p in self.patients:
            adm, end = p["admission_date"], self._window_end(p)
            hours = pd.date_range(adm, end, freq="1h", inclusive="left")
            if len(hours) == 0:
                continue
            local = hours.tz_convert(self.tz)
            path_mult = 1 + sum(PATH_HAZARD[x] for x in p["_paths"])
            daily = 0.55 * AGE_HAZARD[p["_age_idx"]] * path_mult * UNIT_HAZARD[p["care_unit"]] * p["_frailty"]
            lam = daily / 24 * HOUR_W[local.hour.values] * DOW_W[local.day_of_week.values]
            counts = rng.poisson(lam)
            for hi in np.nonzero(counts)[0]:
                for _ in range(counts[hi]):
                    t = (hours[hi] + timedelta(seconds=r.uniform(0, 3600))).to_pydatetime().replace(microsecond=0)
                    if t >= end:
                        continue
                    w = self._type_weights(p, t)
                    atype = r.choices(list(w), list(w.values()))[0]
                    sev = self._severity(p, atype)
                    chain = [(t, sev)]
                    if r.random() < 0.3 + (0.1 if p["_frailty"] > 1.5 else 0):
                        tt = t
                        for _ in range(r.randint(1, 3)):
                            tt = tt + timedelta(minutes=r.uniform(5, 90))
                            if tt >= end:
                                break
                            chain.append((tt, sev))
                    for ts, s in chain:
                        source_seq += 1
                        self._emit_alarm(p, atype, s, ts, f"seed-{source_seq:07d}")

    def _emit_alarm(self, p, atype, sev, t: datetime, source_event_id: str):
        r, rng = self.r, self.rng
        value = self._trigger_value(atype, sev)
        mtype = d.ALARM_MEASUREMENT[atype] or "heart_rate"
        mid = self._add_measurement(p, mtype, value, t, t + timedelta(seconds=r.randint(1, 5)),
                                    "missing" if value is None else "valid")
        local_h = t.astimezone(self.tz).hour
        f = 1.0
        f *= 1.6 if 6 <= local_h < 9 else 1.3 if (local_h >= 23 or local_h < 6) else 1.0
        f *= {"critical": 0.5, "warning": 1.0, "advisory": 1.5}[sev]
        f *= 1.2 if p["care_unit"].startswith("Telemetry") else 1.0
        ack_delay = min(rng.lognormal(math.log(2.5), 0.8) * f, 60)
        ack = t + timedelta(minutes=ack_delay, seconds=r.randint(0, 59))
        res = ack + timedelta(minutes=min(rng.lognormal(math.log(12), 0.7), 240))
        age_min = (self.anchor - t).total_seconds() / 60
        if p["monitoring_end"] is None and age_min < 90 and r.random() < 0.6:
            ack = res = None  # still unacknowledged
        elif p["monitoring_end"] is None and age_min < 360 and r.random() < 0.35:
            res = None  # acknowledged, still open
        if ack and ack > self.anchor:
            ack = res = None
        if res and res > self.anchor:
            res = None
        nurse = self._nurse(p, t)
        status = "new" if ack is None else "acknowledged" if res is None else "resolved"
        alarm_id = len(self.alarms) + 1
        if res is not None:
            prob = {"critical": 1.0, "warning": 0.4, "advisory": 0.15}[sev]
            if r.random() < prob:
                if atype == "Signal loss":
                    disp = r.choices(d.DISPOSITIONS, [0.05, 0.1, 0.85, 0.0])[0]
                elif sev == "critical":
                    disp = r.choices(d.DISPOSITIONS, [0.5, 0.15, 0.05, 0.3])[0]
                else:
                    disp = r.choices(d.DISPOSITIONS, [0.25, 0.6, 0.15, 0.0])[0]
                reviewer = nurse if r.random() < 0.7 else r.choice(d.DOCTORS)
                self.reviews.append(dict(patient_id=p["patient_id"], alarm_id=alarm_id, reviewer=reviewer,
                                         review_timestamp=res, disposition=disp,
                                         notes=f"[synthetic] {atype} reviewed; {disp.lower()}."))
                status = "reviewed"
        self.alarms.append(dict(
            alarm_id=alarm_id, source_event_id=source_event_id, patient_id=p["patient_id"], measurement_id=mid,
            alarm_type=atype, severity=sev, trigger_value=value,
            trigger_unit=d.MEASUREMENT_UNITS[mtype] if value is not None else None,
            triggered_at=t, received_at=t + timedelta(seconds=r.randint(1, 5)),
            acknowledged_at=ack, acknowledged_by=nurse if ack else None, resolved_at=res, assigned_nurse=nurse,
            clinical_review_status=status, source="seed-history", simulated_flag=True))

    # ---------------------------------------------------------------- outcomes
    def build_outcomes(self):
        """Synthetic in-hospital mortality for completed stays (see OUTCOME_PATTERNS)."""
        crit = {}
        for a in self.alarms:
            if a["severity"] == "critical":
                crit[a["patient_id"]] = crit.get(a["patient_id"], 0) + 1
        for p in self.patients:
            if p["monitoring_end"] is None:
                p["discharge_outcome"] = None
                continue
            treatments = {t["treatment_type"] for t in self.treatments if t["patient_id"] == p["patient_id"]}
            meds = {cls for cls, _, _ in p["_meds"]}
            risk = 0.035 * MORT_AGE[p["_age_idx"]] * UNIT_MORT[p["care_unit"]]
            for path in p["_paths"]:
                risk *= PATH_MORT.get(path, 1.0)
            risk *= 1 + 0.25 * min(crit.get(p["patient_id"], 0), 6)
            if "Cardiac rehabilitation" in treatments:
                risk *= 0.45
            if "Atrial fibrillation" in p["_paths"] and "Anticoagulants" in meds:
                risk *= 0.7
            if "Heart failure" in p["_paths"] and "Beta blockers" in meds:
                risk *= 0.75
            risk *= min(p["_frailty"], 2.5) ** 0.5
            p["discharge_outcome"] = "Deceased" if self.r.random() < min(risk, 0.6) else "Discharged alive"

    def run(self):
        self.build_patients()
        self.build_alarms()  # alarm measurements first so they win any idempotency collision
        self.build_measurements()
        self.build_outcomes()
        return self


TABLES = ["audit_log", "clinical_reviews", "alarms", "cardiac_measurements", "treatments", "medications",
          "diagnoses", "patients"]


def _copy(cur, table: str, rows: list[dict], cols: list[str]):
    with cur.copy(f"COPY {table} ({', '.join(cols)}) FROM STDIN") as cp:
        for row in rows:
            cp.write_row([row[c] for c in cols])


def write(gen: Generator):
    raw = engine.raw_connection()
    try:
        cur = raw.driver_connection.cursor()
        cur.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE")
        pcols = ["patient_id", "synthetic_name", "date_of_birth", "sex", "admission_date", "monitoring_end",
                 "care_unit", "monitoring_status", "discharge_outcome", "assigned_care_team", "device_id", "device_type"]
        _copy(cur, "patients", gen.patients, pcols)
        _copy(cur, "diagnoses", gen.diagnoses, ["patient_id", "diagnosis_code", "pathology_name", "diagnosis_date",
                                                "resolved_date", "active_status"])
        _copy(cur, "medications", gen.medications, ["patient_id", "medication_name", "medication_class",
                                                    "prescribed_dose", "route", "start_time", "end_time", "status"])
        _copy(cur, "treatments", gen.treatments, ["patient_id", "treatment_type", "start_date", "end_date", "status"])
        _copy(cur, "cardiac_measurements", list(gen.measurements.values()),
              ["measurement_id", "patient_id", "device_id", "measurement_type", "numeric_value", "unit",
               "observed_at", "received_at", "quality_status"])
        _copy(cur, "alarms", gen.alarms,
              ["alarm_id", "source_event_id", "patient_id", "measurement_id", "alarm_type", "severity",
               "trigger_value", "trigger_unit", "triggered_at", "received_at", "acknowledged_at", "acknowledged_by",
               "resolved_at", "assigned_nurse", "clinical_review_status", "source", "simulated_flag"])
        _copy(cur, "clinical_reviews", gen.reviews,
              ["patient_id", "alarm_id", "reviewer", "review_timestamp", "disposition", "notes"])
        for table, col in [("cardiac_measurements", "measurement_id"), ("alarms", "alarm_id")]:
            cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', '{col}'), (SELECT MAX({col}) FROM {table}))")
        raw.commit()
    finally:
        raw.close()


def is_empty() -> bool:
    with engine.connect() as c:
        return c.execute(text("SELECT COUNT(*) FROM patients")).scalar() == 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="wipe and regenerate even if data exists")
    ap.add_argument("--patients", type=int, default=1000)
    args = ap.parse_args()
    if not args.reset and not is_empty():
        print("Database already seeded; use --reset to regenerate.")
        return
    anchor = _anchor()
    gen = Generator(SEED_RANDOM, anchor, n_patients=args.patients).run()
    write(gen)
    print(f"Seeded synthetic data (seed={SEED_RANDOM}, anchor={anchor.isoformat()}):")
    print(f"  patients={len(gen.patients)} diagnoses={len(gen.diagnoses)} medications={len(gen.medications)} "
          f"treatments={len(gen.treatments)}")
    print(f"  measurements={len(gen.measurements)} (duplicates dropped: {gen.duplicates_dropped}) "
          f"alarms={len(gen.alarms)} reviews={len(gen.reviews)}")


if __name__ == "__main__":
    main()
