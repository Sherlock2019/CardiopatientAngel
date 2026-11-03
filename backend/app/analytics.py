"""Population alarm-burden analytics (descriptive only; see ANALYTICS_METHODS.md).

Key ideas
- Exposure = monitored patient-time: the patient's monitoring window clipped to the analysis window.
- Diagnosis / medication / treatment cohorts use *time-bounded* exposure: an alarm is attributed
  to a cohort only if that diagnosis/medication/treatment was valid when the alarm fired, and
  the exposure counted is only the time it was valid. Patients can sit in several cohorts at once.
- Rates are alarms per 100 monitored patient-days (or patient-hours for hour-of-day views).
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from sqlalchemy import text

from . import domain as d
from . import settings_store
from .db import engine

FAR = pd.Timestamp("2100-01-01", tz="UTC")
DAY = pd.Timedelta(days=1)
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class Frames:
    now: pd.Timestamp
    patients: pd.DataFrame
    alarms: pd.DataFrame
    intervals: dict[str, pd.DataFrame]  # dimension -> [patient_id, key, start, end]


_cache: dict = {"frames": None, "loaded": 0.0, "dirty": False}
_lock = threading.Lock()


def invalidate():
    _cache["dirty"] = True


def _utc(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True).dt.as_unit("ns")


def _load() -> Frames:
    now = pd.Timestamp.now(tz="UTC")
    with engine.connect() as c:
        p = pd.read_sql(text(
            "SELECT patient_id, synthetic_name, sex, date_of_birth, admission_date, monitoring_end, care_unit, "
            "device_type, monitoring_status, discharge_outcome FROM patients"), c)
        a = pd.read_sql(text(
            "SELECT alarm_id, patient_id, alarm_type, severity, triggered_at, acknowledged_at, resolved_at, "
            "assigned_nurse FROM alarms"), c)
        dg = pd.read_sql(text(
            "SELECT patient_id, pathology_name AS key, diagnosis_date AS start, resolved_date AS end FROM diagnoses"), c)
        md = pd.read_sql(text(
            "SELECT patient_id, medication_class AS key, start_time AS start, end_time AS end FROM medications"), c)
        tr = pd.read_sql(text(
            "SELECT patient_id, treatment_type AS key, start_date AS start, end_date AS end FROM treatments"), c)
    p["start"] = _utc(p["admission_date"])
    p["end"] = _utc(p["monitoring_end"]).fillna(now).clip(upper=now)
    p["age"] = [d.age_on(dob, adm) for dob, adm in zip(p["date_of_birth"], p["admission_date"])]
    p["age_group"] = p["age"].map(d.age_group)
    for col in ("triggered_at", "acknowledged_at", "resolved_at"):
        a[col] = _utc(a[col])
    a["ack_min"] = (a["acknowledged_at"] - a["triggered_at"]).dt.total_seconds() / 60
    a["is_critical"] = a["severity"] == "critical"
    a = a.sort_values(["patient_id", "alarm_type", "triggered_at"])
    prev = a.groupby(["patient_id", "alarm_type"])["triggered_at"].shift()
    window = pd.Timedelta(minutes=settings_store.get()["repeat_window_minutes"])
    a["is_repeat"] = (a["triggered_at"] - prev) <= window
    a = a.merge(p[["patient_id", "care_unit", "age_group"]], on="patient_id", how="left")
    a = a.sort_values("triggered_at").reset_index(drop=True)
    intervals = {}
    for name, df in (("pathology", dg), ("medication", md), ("treatment", tr)):
        df["start"] = _utc(df["start"])
        df["end"] = _utc(df["end"]).fillna(FAR)
        intervals[name] = df
    return Frames(now=now, patients=p, alarms=a, intervals=intervals)


def frames() -> Frames:
    with _lock:
        age = time.time() - _cache["loaded"]
        if _cache["frames"] is None or age > 60 or (_cache["dirty"] and age > 3):
            _cache["frames"] = _load()
            _cache["loaded"] = time.time()
            _cache["dirty"] = False
        return _cache["frames"]


def reset_cache():
    with _lock:
        _cache.update(frames=None, loaded=0.0, dirty=False)


# ------------------------------------------------------------------------------------------- helpers
@dataclass
class Window:
    lo: pd.Timestamp
    hi: pd.Timestamp
    tz: str


def make_window(F: Frames, date_from: date | None, date_to: date | None, tz: str | None) -> Window:
    tz = tz or settings_store.get()["display_timezone"]
    ZoneInfo(tz)  # validates
    lo = pd.Timestamp(date_from, tz=tz).tz_convert("UTC") if date_from else F.now - pd.Timedelta(days=90)
    hi = (pd.Timestamp(date_to, tz=tz) + DAY).tz_convert("UTC") if date_to else F.now
    return Window(lo=max(lo, F.now - pd.Timedelta(days=366)), hi=min(hi, F.now), tz=tz)


def _patients(F: Frames, units: list[str] | None = None) -> pd.DataFrame:
    p = F.patients
    return p[p["care_unit"].isin(units)] if units else p


def _alarms(F: Frames, w: Window, units=None, alarm_types=None, severities=None) -> pd.DataFrame:
    a = F.alarms
    m = (a["triggered_at"] >= w.lo) & (a["triggered_at"] < w.hi)
    if units:
        m &= a["care_unit"].isin(units)
    if alarm_types:
        m &= a["alarm_type"].isin(alarm_types)
    if severities:
        m &= a["severity"].isin(severities)
    return a[m]


def _clip(df: pd.DataFrame, pats: pd.DataFrame, w: Window) -> pd.DataFrame:
    """Intersect [start,end) intervals with each patient's monitoring window and the analysis window."""
    m = df.merge(pats[["patient_id", "start", "end", "age_group"]], on="patient_id", suffixes=("", "_m"))
    s = m["start"].where(m["start"] > m["start_m"], m["start_m"]).clip(lower=w.lo)
    e = m["end"].where(m["end"] < m["end_m"], m["end_m"]).clip(upper=w.hi)
    m = m.assign(s=s, e=e)
    return m[m["e"] > m["s"]]


def _merge_overlaps(iv: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Union overlapping intervals per (patient, key) so exposure is never double counted."""
    if iv.empty:
        return iv
    iv = iv.sort_values(keys + ["s"]).reset_index(drop=True)
    grouping = [iv[k] for k in keys]
    prev_end = iv.groupby(grouping)["e"].cummax().groupby(grouping).shift()
    new_block = prev_end.isna() | (iv["s"] > prev_end)
    iv["_blk"] = new_block.cumsum()
    out = iv.groupby(keys + ["_blk"], as_index=False).agg(s=("s", "min"), e=("e", "max"))
    return out.drop(columns="_blk")


def _rate_table(iv: pd.DataFrame, alarms: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    iv = iv.assign(days=(iv["e"] - iv["s"]).dt.total_seconds() / 86400)
    exp = iv.groupby(keys).agg(patients=("patient_id", "nunique"), exposure_days=("days", "sum"))
    extra = [k for k in keys if k != "patient_id"]
    j = alarms.drop(columns=[k for k in extra if k in alarms.columns]).merge(
        iv[["patient_id", "s", "e"] + extra], on="patient_id")
    j = j[(j["triggered_at"] >= j["s"]) & (j["triggered_at"] < j["e"])].drop_duplicates(["alarm_id"] + keys)
    agg = j.groupby(keys).agg(
        alarms=("alarm_id", "size"),
        critical=("is_critical", "sum"),
        repeats=("is_repeat", "sum"),
        patients_with_alarm=("patient_id", "nunique"),
        median_ack_min=("ack_min", "median"),
    )
    out = exp.join(agg, how="left")
    for c in ("alarms", "critical", "repeats", "patients_with_alarm"):
        out[c] = out[c].fillna(0).astype(int)
    out["rate_per_100_patient_days"] = out["alarms"] / out["exposure_days"] * 100
    out["critical_rate_per_100_patient_days"] = out["critical"] / out["exposure_days"] * 100
    out["pct_patients_with_alarm"] = out["patients_with_alarm"] / out["patients"] * 100
    out["repeat_pct"] = np.where(out["alarms"] > 0, out["repeats"] / out["alarms"].clip(lower=1) * 100, 0.0)
    return out.reset_index()


def _flag_small(df: pd.DataFrame) -> pd.DataFrame:
    s = settings_store.get()
    df["small_cohort"] = df["patients"] < s["small_cohort_patients"]
    df["suppressed"] = df["patients"] < s["suppress_cohort_patients"]
    rate_cols = [c for c in df.columns if "rate" in c or c.startswith("pct_") or c == "repeat_pct"]
    df.loc[df["suppressed"], rate_cols] = np.nan
    return df


def records(df: pd.DataFrame) -> list[dict]:
    out = []
    for row in df.to_dict(orient="records"):
        clean = {}
        for k, v in row.items():
            if isinstance(v, (float, np.floating)):
                clean[k] = None if np.isnan(v) else round(float(v), 2)
            elif isinstance(v, (np.integer,)):
                clean[k] = int(v)
            elif isinstance(v, (np.bool_,)):
                clean[k] = bool(v)
            elif isinstance(v, pd.Timestamp):
                clean[k] = v.isoformat()
            else:
                clean[k] = v
        out.append(clean)
    return out


def _monitor_iv(pats: pd.DataFrame, w: Window) -> pd.DataFrame:
    s = pats["start"].clip(lower=w.lo)
    e = pats["end"].clip(upper=w.hi)
    iv = pats.assign(s=s, e=e)
    return iv[iv["e"] > iv["s"]]


# ------------------------------------------------------------------------------------------- endpoints
def by_age(F: Frames, w: Window, units=None, alarm_types=None, severities=None) -> list[dict]:
    pats = _patients(F, units)
    iv = _monitor_iv(pats, w)
    t = _rate_table(iv, _alarms(F, w, units, alarm_types, severities), ["age_group"])
    t = t.set_index("age_group").reindex(d.AGE_GROUPS).reset_index()
    t[["patients", "alarms", "critical"]] = t[["patients", "alarms", "critical"]].fillna(0).astype(int)
    return records(_flag_small(t))


def by_device(F: Frames, w: Window, units=None) -> list[dict]:
    """Alarm burden per device type, split into clinical vs. technical (signal loss, low battery) alarms."""
    pats = _patients(F, units)
    iv = _monitor_iv(pats, w)
    a = _alarms(F, w, units)
    t = _rate_table(iv, a.merge(pats[["patient_id", "device_type"]], on="patient_id"), ["device_type"])
    tech = a[a["alarm_type"].isin(d.TECHNICAL_ALARMS)].merge(pats[["patient_id", "device_type"]], on="patient_id") \
        .groupby("device_type").size()
    t["technical_alarms"] = t["device_type"].map(tech).fillna(0).astype(int)
    t["technical_pct"] = np.where(t["alarms"] > 0, t["technical_alarms"] / t["alarms"].clip(lower=1) * 100, np.nan)
    t["technical_rate_per_100_patient_days"] = t["technical_alarms"] / t["exposure_days"] * 100
    order = {k: i for i, k in enumerate(d.DEVICE_TYPES)}
    t = t.sort_values("device_type", key=lambda s: s.map(order))
    return records(_flag_small(t))


def by_dimension(F: Frames, w: Window, dimension: str, units=None, alarm_types=None, severities=None) -> list[dict]:
    pats = _patients(F, units)
    iv = _merge_overlaps(_clip(F.intervals[dimension], pats, w), ["patient_id", "key"])
    t = _rate_table(iv, _alarms(F, w, units, alarm_types, severities), ["key"])
    t = t.sort_values("rate_per_100_patient_days", ascending=False)
    return records(_flag_small(t))


def age_pathology_matrix(F: Frames, w: Window, units=None) -> list[dict]:
    pats = _patients(F, units)
    iv = _clip(F.intervals["pathology"], pats, w)
    iv = _merge_overlaps(iv.merge(pats[["patient_id"]], on="patient_id"), ["patient_id", "key"])
    iv = iv.merge(pats[["patient_id", "age_group"]], on="patient_id")
    t = _rate_table(iv, _alarms(F, w, units), ["age_group", "key"])
    return records(_flag_small(t))


def medication_alarm_matrix(F: Frames, w: Window, units=None) -> dict:
    pats = _patients(F, units)
    iv = _merge_overlaps(_clip(F.intervals["medication"], pats, w), ["patient_id", "key"])
    iv = iv.assign(days=(iv["e"] - iv["s"]).dt.total_seconds() / 86400)
    exposure = iv.groupby("key").agg(patients=("patient_id", "nunique"), exposure_days=("days", "sum"))
    alarms = _alarms(F, w, units)
    j = alarms.merge(iv[["patient_id", "key", "s", "e"]], on="patient_id")
    j = j[(j["triggered_at"] >= j["s"]) & (j["triggered_at"] < j["e"])]
    cells = j.groupby(["key", "alarm_type"]).size().rename("alarms").reset_index()
    cells = cells.merge(exposure, left_on="key", right_index=True)
    cells["rate_per_100_patient_days"] = cells["alarms"] / cells["exposure_days"] * 100
    tot = cells.groupby("key")["alarms"].transform("sum")
    cells["share_pct"] = cells["alarms"] / tot * 100
    # multi-class exposure: how many classes were active at each alarm
    per_alarm = j.groupby("alarm_id")["key"].nunique()
    return {
        "cells": records(cells),
        "classes": records(_flag_small(exposure.reset_index())),
        "alarms_with_any_class_active": int(per_alarm.size),
        "alarms_with_multiple_classes_active": int((per_alarm > 1).sum()),
        "total_alarms": int(len(alarms)),
    }


def _naive(s: pd.Series) -> np.ndarray:
    """UTC datetimes as a tz-naive numpy datetime64[ns] array (for searchsorted / vector math)."""
    return s.dt.tz_convert(None).to_numpy()


def _num(v, digits: int = 2):
    """Round for JSON; NaN/None -> None."""
    return None if v is None or pd.isna(v) else round(float(v), digits)


def _hourly_census(pats: pd.DataFrame, w: Window) -> pd.DataFrame:
    grid = pd.date_range(w.lo.floor("h"), w.hi, freq="h", inclusive="left")
    if len(grid) == 0:
        return pd.DataFrame(columns=["ts", "census"])
    mid = (grid + pd.Timedelta(minutes=30)).tz_convert(None).to_numpy()
    starts = np.sort(_naive(pats["start"]))
    ends = np.sort(_naive(pats["end"]))
    census = np.searchsorted(starts, mid, side="right") - np.searchsorted(ends, mid, side="right")
    return pd.DataFrame({"ts": grid, "census": census})


def heatmap(F: Frames, w: Window, units=None, alarm_types=None, severities=None) -> dict:
    pats = _patients(F, units)
    hc = _hourly_census(pats, w)
    local = pd.DatetimeIndex(hc["ts"]).tz_convert(w.tz)
    hc = hc.assign(dow=local.day_of_week, hour=local.hour)
    exp = hc.groupby(["dow", "hour"])["census"].sum().rename("patient_hours")
    a = _alarms(F, w, units, alarm_types, severities)
    al = a["triggered_at"].dt.tz_convert(w.tz)
    cnt = a.assign(dow=al.dt.day_of_week, hour=al.dt.hour).groupby(["dow", "hour"]).size().rename("alarms")
    idx = pd.MultiIndex.from_product([range(7), range(24)], names=["dow", "hour"])
    t = pd.concat([exp, cnt], axis=1).reindex(idx).fillna(0).reset_index()
    t["rate_per_100_patient_hours"] = np.where(t["patient_hours"] > 0, t["alarms"] / t["patient_hours"].clip(lower=1) * 100, np.nan)
    t["day"] = t["dow"].map(lambda i: DOW[i])
    t[["alarms", "patient_hours"]] = t[["alarms", "patient_hours"]].astype(int)
    return {"timezone": w.tz, "cells": records(t)}


def trends(F: Frames, w: Window, granularity: str = "day", units=None) -> list[dict]:
    pats = _patients(F, units)
    hc = _hourly_census(pats, w)
    local = pd.DatetimeIndex(hc["ts"]).tz_convert(w.tz)
    period = local.tz_localize(None).to_period("W-SUN" if granularity == "week" else "D").start_time
    exp = hc.assign(period=period).groupby("period")["census"].sum() / 24
    a = _alarms(F, w, units)
    ap = a["triggered_at"].dt.tz_convert(w.tz).dt.tz_localize(None).dt.to_period(
        "W-SUN" if granularity == "week" else "D").dt.start_time
    g = a.assign(period=ap).groupby("period").agg(
        alarms=("alarm_id", "size"), critical=("is_critical", "sum"), repeats=("is_repeat", "sum"),
        median_ack_min=("ack_min", "median"))
    t = pd.concat([exp.rename("patient_days"), g], axis=1).fillna({"alarms": 0, "critical": 0, "repeats": 0})
    t["rate_per_100_patient_days"] = t["alarms"] / t["patient_days"].where(t["patient_days"] > 0) * 100
    t = t.reset_index().rename(columns={"index": "period"})
    t["period"] = t["period"].dt.strftime("%Y-%m-%d")
    t[["alarms", "critical", "repeats"]] = t[["alarms", "critical", "repeats"]].astype(int)
    return records(t)


def _peak_window(hour_counts: np.ndarray, width: int = 3) -> tuple[int, int]:
    rolled = np.array([hour_counts[[(h + k) % 24 for k in range(width)]].sum() for h in range(24)])
    h = int(rolled.argmax())
    return h, int(rolled[h])


def staffing(F: Frames, w: Window, units=None) -> dict:
    pats = _patients(F, units)
    hc = _hourly_census(pats, w)
    local = pd.DatetimeIndex(hc["ts"]).tz_convert(w.tz)
    hc = hc.assign(shift=[d.shift_of(h) for h in local.hour])
    a = _alarms(F, w, units)
    lh = a["triggered_at"].dt.tz_convert(w.tz).dt.hour
    a = a.assign(hour=lh, shift=lh.map(d.shift_of))
    shift_exp = hc.groupby("shift")["census"].sum().rename("patient_hours")
    sg = a.groupby("shift").agg(alarms=("alarm_id", "size"), critical=("is_critical", "sum"),
                                median_ack_min=("ack_min", "median"), mean_ack_min=("ack_min", "mean"),
                                p90_ack_min=("ack_min", lambda x: x.quantile(0.9)), repeats=("is_repeat", "sum"))
    shifts = pd.concat([shift_exp, sg], axis=1).reindex([s[0] for s in d.SHIFTS]).fillna(0)
    shifts["rate_per_100_patient_hours"] = shifts["alarms"] / shifts["patient_hours"].clip(lower=1) * 100
    shifts = shifts.reset_index().rename(columns={"index": "shift"})
    shifts["hours"] = shifts["shift"].map({s[0]: f"{s[1]:02d}:00–{s[2]:02d}:00" for s in d.SHIFTS})

    hourly = a.groupby("hour").agg(alarms=("alarm_id", "size"), median_ack_min=("ack_min", "median"))
    hourly = hourly.reindex(range(24)).fillna({"alarms": 0}).reset_index().rename(columns={"index": "hour"})

    units_out, insights = [], []
    for unit in (units or d.CARE_UNITS):
        ua = a[a["care_unit"] == unit]
        up = pats[pats["care_unit"] == unit]
        exp_days = _monitor_iv(up, w).pipe(lambda x: ((x["e"] - x["s"]).dt.total_seconds() / 86400).sum())
        counts = np.bincount(ua["hour"], minlength=24) if len(ua) else np.zeros(24, dtype=int)
        ph, pc = _peak_window(counts)
        units_out.append(dict(
            unit=unit, alarms=int(len(ua)), exposure_days=round(float(exp_days), 1),
            rate_per_100_patient_days=round(float(len(ua) / exp_days * 100), 2) if exp_days else None,
            median_ack_min=None if ua.empty else _num(ua["ack_min"].median()),
            repeat_pct=None if ua.empty else _num(ua["is_repeat"].mean() * 100, 1),
            peak_start_hour=ph, peak_alarms=pc, hourly=[int(x) for x in counts],
        ))
        if len(ua):
            insights.append(f"{unit} recorded its highest historical alarm volume between "
                            f"{ph:02d}:00 and {(ph + 3) % 24:02d}:00 ({pc} alarms, {w.tz}).")
    if not shifts.empty and shifts["alarms"].sum() > 0 and shifts["median_ack_min"].notna().any():
        slow = shifts.sort_values("median_ack_min", ascending=False).iloc[0]
        busy = shifts.sort_values("rate_per_100_patient_hours", ascending=False).iloc[0]
        insights.insert(0, f"The {busy['shift']} shift ({busy['hours']}) had the highest exposure-adjusted alarm "
                           f"rate ({busy['rate_per_100_patient_hours']:.1f} per 100 patient-hours).")
        insights.insert(1, f"Median acknowledgment time was longest on the {slow['shift']} shift "
                           f"({slow['median_ack_min']:.1f} min).")
    top_unit = max(units_out, key=lambda u: u["repeat_pct"] or 0, default=None)
    if top_unit and top_unit["repeat_pct"]:
        insights.append(f"{top_unit['unit']} had the largest share of repeated alarms ({top_unit['repeat_pct']}%).")

    # Live backlog (not limited to the analysis window)
    live = F.alarms[F.alarms["resolved_at"].isna()]
    if units:
        live = live[live["care_unit"].isin(units)]
    unack = live[live["acknowledged_at"].isna()]
    backlog = unack.groupby(["care_unit", "severity"]).size().rename("count").reset_index()
    oldest = unack.groupby("care_unit")["triggered_at"].min()
    backlog_units = [dict(unit=u, total=int(len(unack[unack["care_unit"] == u])),
                          by_severity={s: int(backlog[(backlog["care_unit"] == u) & (backlog["severity"] == s)]["count"].sum())
                                       for s in d.SEVERITIES},
                          oldest_minutes=round(float((F.now - oldest[u]).total_seconds() / 60), 1) if u in oldest else None)
                     for u in (units or d.CARE_UNITS)]
    return {
        "timezone": w.tz,
        "shifts": records(shifts),
        "hourly": records(hourly),
        "units": units_out,
        "backlog": backlog_units,
        "insights": insights,
        "disclaimer": "Descriptive historical patterns from synthetic data. Not a staffing recommendation; "
                      "staffing decisions follow hospital policy and clinical leadership.",
    }


def summary(F: Frames) -> dict:
    a = F.alarms
    now = F.now
    active = a[a["resolved_at"].isna()]
    unack = active[active["acknowledged_at"].isna()]
    last24 = a[a["triggered_at"] >= now - DAY]
    acked24 = last24.dropna(subset=["ack_min"])
    rep24 = last24[last24["is_repeat"]]
    monitored = F.patients[F.patients["monitoring_status"] == "active"]
    hourly = last24.assign(h=last24["triggered_at"].dt.floor("h")).groupby("h").size()
    grid = pd.date_range((now - DAY).floor("h"), now.floor("h"), freq="h")
    hourly = hourly.reindex(grid, fill_value=0)
    return {
        "as_of": now.isoformat(),
        "monitored_patients": int(len(monitored)),
        "active_alarms": int(len(active)),
        "unacknowledged_alarms": int(len(unack)),
        "critical_active_alarms": int((active["severity"] == "critical").sum()),
        "patients_with_repeated_alarms_24h": int(rep24["patient_id"].nunique()),
        "median_ack_minutes_24h": None if acked24.empty else round(float(acked24["ack_min"].median()), 2),
        "alarms_24h": int(len(last24)),
        "active_by_severity": {s: int((active["severity"] == s).sum()) for s in d.SEVERITIES},
        "active_by_unit": {u: int((active["care_unit"] == u).sum()) for u in d.CARE_UNITS},
        "hourly_24h": [{"hour": ts.isoformat(), "alarms": int(v)} for ts, v in hourly.items()],
        "total_patients": int(len(F.patients)),
        "total_alarms": int(len(a)),
    }


# ------------------------------------------------------------------------------------------- cohort explorer
def _merged_lists(df: pd.DataFrame) -> dict[str, list[tuple[int, int]]]:
    out: dict[str, list[tuple[int, int]]] = {}
    for pid, s, e in sorted(zip(df["patient_id"], pd.DatetimeIndex(df["s"]).as_unit("ns").asi8,
                                pd.DatetimeIndex(df["e"]).as_unit("ns").asi8)):
        lst = out.setdefault(pid, [])
        if lst and s <= lst[-1][1]:
            lst[-1] = (lst[-1][0], max(lst[-1][1], e))
        else:
            lst.append((s, e))
    return out


def _intersect(a: list[tuple[int, int]], b: list[tuple[int, int]]) -> list[tuple[int, int]]:
    i = j = 0
    out = []
    while i < len(a) and j < len(b):
        s, e = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if s < e:
            out.append((s, e))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


@dataclass
class CohortFilter:
    age_groups: list[str]
    pathologies: list[str]
    medication_classes: list[str]
    treatments: list[str]
    units: list[str]
    alarm_types: list[str]
    severities: list[str]
    hours: list[int]

    def is_empty(self) -> bool:
        return not any(vars(self).values())


def cohort_intervals(F: Frames, w: Window, f: CohortFilter) -> pd.DataFrame:
    pats = _patients(F, f.units)
    if f.age_groups:
        pats = pats[pats["age_group"].isin(f.age_groups)]
    base = _merged_lists(_monitor_iv(pats, w))
    for dim, sel in (("pathology", f.pathologies), ("medication", f.medication_classes), ("treatment", f.treatments)):
        if not sel:
            continue
        iv = F.intervals[dim]
        dim_lists = _merged_lists(_clip(iv[iv["key"].isin(sel)], pats, w))
        base = {pid: _intersect(lst, dim_lists[pid]) for pid, lst in base.items() if pid in dim_lists}
    rows = [(pid, s, e) for pid, lst in base.items() for s, e in lst]
    df = pd.DataFrame(rows, columns=["patient_id", "s", "e"])
    df["s"] = pd.to_datetime(df["s"], utc=True)
    df["e"] = pd.to_datetime(df["e"], utc=True)
    return df


def cohort(F: Frames, w: Window, f: CohortFilter, with_patients: bool = True) -> dict:
    iv = cohort_intervals(F, w, f)
    hour_frac = len(set(f.hours)) / 24 if f.hours else 1.0
    a = _alarms(F, w, f.units, f.alarm_types, f.severities)
    if f.hours:
        a = a[a["triggered_at"].dt.tz_convert(w.tz).dt.hour.isin(f.hours)]
    j = a.merge(iv, on="patient_id")
    j = j[(j["triggered_at"] >= j["s"]) & (j["triggered_at"] < j["e"])].drop_duplicates("alarm_id")
    days = (iv["e"] - iv["s"]).dt.total_seconds() / 86400 * hour_frac
    exposure = float(days.sum())
    n_pat = int(iv["patient_id"].nunique())
    n_alarm = int(len(j))
    s = settings_store.get()
    # weekly trend
    trend = []
    if not iv.empty:
        weeks = pd.date_range(w.lo.tz_convert(w.tz).normalize(), w.hi.tz_convert(w.tz), freq="7D")
        sv, ev = _naive(iv["s"]), _naive(iv["e"])
        for ws in weeks:
            we = ws + pd.Timedelta(days=7)
            wsu, weu = ws.tz_convert("UTC").tz_localize(None).to_datetime64(), we.tz_convert("UTC").tz_localize(None).to_datetime64()
            ov = (np.minimum(ev, weu) - np.maximum(sv, wsu)).astype("timedelta64[s]").astype(float)
            wexp = float(np.clip(ov, 0, None).sum() / 86400 * hour_frac)
            wa = j[(j["triggered_at"] >= ws) & (j["triggered_at"] < we)]
            trend.append(dict(week=ws.strftime("%Y-%m-%d"), exposure_days=round(wexp, 1), alarms=int(len(wa)),
                              critical=int(wa["is_critical"].sum()),
                              rate_per_100_patient_days=round(len(wa) / wexp * 100, 2) if wexp > 0.5 else None))
    out = dict(
        patients=n_pat,
        exposure_days=round(exposure, 1),
        alarms=n_alarm,
        rate_per_100_patient_days=round(n_alarm / exposure * 100, 2) if exposure > 0 else None,
        critical=int(j["is_critical"].sum()),
        critical_rate_per_100_patient_days=round(float(j["is_critical"].sum()) / exposure * 100, 2) if exposure > 0 else None,
        repeat_pct=round(float(j["is_repeat"].mean() * 100), 1) if n_alarm else None,
        median_ack_min=round(float(j["ack_min"].median()), 2) if n_alarm and j["ack_min"].notna().any() else None,
        p90_ack_min=round(float(j["ack_min"].quantile(0.9)), 2) if n_alarm and j["ack_min"].notna().any() else None,
        pct_patients_with_alarm=round(j["patient_id"].nunique() / n_pat * 100, 1) if n_pat else None,
        small_cohort=n_pat < s["small_cohort_patients"],
        suppressed=n_pat < s["suppress_cohort_patients"],
        by_alarm_type=records(j.groupby("alarm_type").size().rename("alarms").reset_index().sort_values("alarms", ascending=False)),
        trend=trend,
    )
    if out["suppressed"]:
        for k in ("rate_per_100_patient_days", "critical_rate_per_100_patient_days", "repeat_pct", "pct_patients_with_alarm"):
            out[k] = None
    if with_patients:
        pe = iv.assign(days=(iv["e"] - iv["s"]).dt.total_seconds() / 86400 * hour_frac).groupby("patient_id")["days"].sum()
        pa = j.groupby("patient_id").agg(alarms=("alarm_id", "size"), critical=("is_critical", "sum"))
        pt = pd.concat([pe.rename("exposure_days"), pa], axis=1).fillna(0)
        pt["rate_per_100_patient_days"] = pt["alarms"] / pt["exposure_days"].where(pt["exposure_days"] > 0) * 100
        pt = pt.join(F.patients.set_index("patient_id")[["synthetic_name", "age", "age_group", "care_unit", "monitoring_status"]])
        pt = pt.sort_values(["alarms", "rate_per_100_patient_days"], ascending=False).head(200).reset_index()
        pt[["alarms", "critical"]] = pt[["alarms", "critical"]].astype(int)
        out["patient_list"] = records(pt.rename(columns={"index": "patient_id"}))
    return out


# ------------------------------------------------------------------------------------------- outcomes
OUTCOME_CAVEATS = [
    "Synthetic data: every difference shown here was generated by documented rules (see ANALYTICS_METHODS.md).",
    "Descriptive comparison only. It cannot show what prevents death: sicker patients receive more treatments "
    "(confounding by indication), and some exposures depend on survival time (e.g. rehabilitation starts later in a stay).",
    "Categories overlap (several diagnoses, treatments and medications per patient), so columns do not sum to 100%.",
    "Small groups are flagged; wide confidence intervals mean the difference may be noise.",
]


# Monitored signs a patient showed during the stay, from clinical alarm types (technical alarms excluded).
SIGN_LABELS = {
    "HR high": "Fast heart rate", "HR low": "Slow heart rate", "SpO2 low": "Low oxygen", "BP low": "Low blood pressure",
    "BP high": "High blood pressure", "Irregular rhythm": "Irregular rhythm", "Fall detected": "Fall",
}


def _wilson(k: int, n: int, z: float = 1.96) -> tuple[float | None, float | None]:
    if n == 0:
        return None, None
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return round(float(max(0, centre - half) * 100), 1), round(float(min(1, centre + half) * 100), 1)


def outcomes(F: Frames, w: Window, units=None) -> dict:
    """Compare completed stays ending in death vs. discharge alive, across clinical dimensions."""
    p = _patients(F, units)
    p = p[p["discharge_outcome"].notna() & (p["end"] >= w.lo) & (p["end"] < w.hi)].copy()
    p["deceased"] = p["discharge_outcome"] == "Deceased"
    p["los_days"] = (p["end"] - p["start"]).dt.total_seconds() / 86400
    a = F.alarms.merge(p[["patient_id", "start", "end"]], on="patient_id")
    a = a[(a["triggered_at"] >= a["start"]) & (a["triggered_at"] < a["end"])]
    per = a.groupby("patient_id").agg(alarms=("alarm_id", "size"), critical=("is_critical", "sum"))
    p = p.join(per, on="patient_id").fillna({"alarms": 0, "critical": 0})
    p["alarms_per_day"] = p["alarms"] / p["los_days"].clip(lower=0.25)
    p["critical_bucket"] = pd.cut(p["critical"], [-1, 0, 2, 1e9], labels=["0", "1–2", "3+"]).astype(str)

    # membership tables: (patient_id, category) per dimension
    def during_stay(dim: str) -> pd.DataFrame:
        iv = F.intervals[dim].merge(p[["patient_id", "start", "end"]], on="patient_id", suffixes=("", "_m"))
        iv = iv[(iv["start"] < iv["end_m"]) & (iv["end"] > iv["start_m"])]
        return iv[["patient_id", "key"]].drop_duplicates()

    members = {
        "Age group": p[["patient_id", "age_group"]].rename(columns={"age_group": "key"}),
        "Disease": during_stay("pathology"),
        "Treatment": during_stay("treatment"),
        "Medication class": during_stay("medication"),
        "Care unit": p[["patient_id", "care_unit"]].rename(columns={"care_unit": "key"}),
        "Sex": p[["patient_id", "sex"]].assign(sex=lambda x: x["sex"].map({"F": "Female", "M": "Male"})).rename(columns={"sex": "key"}),
        "Critical alarms during stay": p[["patient_id", "critical_bucket"]].rename(columns={"critical_bucket": "key"}),
        "Signs during stay": a[a["alarm_type"].isin(list(SIGN_LABELS))][["patient_id", "alarm_type"]]
            .assign(key=lambda x: x["alarm_type"].map(SIGN_LABELS))[["patient_id", "key"]].drop_duplicates(),
    }
    order = {"Age group": d.AGE_GROUPS, "Disease": list(d.PATHOLOGIES), "Treatment": d.TREATMENTS,
             "Medication class": d.MEDICATION_CLASSES, "Care unit": d.CARE_UNITS, "Sex": ["Female", "Male"],
             "Critical alarms during stay": ["0", "1–2", "3+"], "Signs during stay": list(SIGN_LABELS.values())}
    n_dec, n_alive = int(p["deceased"].sum()), int((~p["deceased"]).sum())
    small = settings_store.get()["small_cohort_patients"]
    dims = []
    for name, m in members.items():
        m = m.merge(p[["patient_id", "deceased"]], on="patient_id")
        rows = []
        for cat in order[name]:
            sub = m[m["key"] == cat]
            k, n = int(sub["deceased"].sum()), int(len(sub))
            alive = n - k
            lo, hi = _wilson(k, n)
            dec_pct = k / n_dec * 100 if n_dec else 0.0
            alive_pct = alive / n_alive * 100 if n_alive else 0.0
            rows.append(dict(category=cat, deceased_n=k, deceased_pct=round(dec_pct, 1), alive_n=alive,
                             alive_pct=round(alive_pct, 1), difference_pp=round(alive_pct - dec_pct, 1),
                             patients=n, mortality_pct=round(k / n * 100, 1) if n else None,
                             mortality_ci_low=lo, mortality_ci_high=hi, small_cohort=n < small))
        dims.append({"dimension": name, "rows": rows})

    def grp(mask):
        g = p[mask]
        return dict(patients=int(len(g)), median_age=None if g.empty else float(g["age"].median()),
                    median_los_days=None if g.empty else round(float(g["los_days"].median()), 1),
                    median_alarms_per_day=None if g.empty else round(float(g["alarms_per_day"].median()), 2),
                    mean_critical_alarms=None if g.empty else round(float(g["critical"].mean()), 2),
                    pct_female=None if g.empty else round(float((g["sex"] == "F").mean() * 100), 1))

    lo, hi = _wilson(n_dec, n_dec + n_alive)
    return {
        "completed_stays": n_dec + n_alive,
        "mortality_pct": round(n_dec / (n_dec + n_alive) * 100, 1) if n_dec + n_alive else None,
        "mortality_ci_low": lo, "mortality_ci_high": hi,
        "deceased": grp(p["deceased"]),
        "alive": grp(~p["deceased"]),
        "dimensions": dims,
        "caveats": OUTCOME_CAVEATS,
    }


# ------------------------------------------------------------------------------------------- attention indicator
def attention_indicator(alarms_recent: list[dict], now: datetime) -> dict:
    """Operational Attention Indicator — Demo Only.

    Transparent additive points from operational alarm facts. Not a clinical risk score; it does
    not predict deterioration, mortality or medication safety.
    """
    cfg = settings_store.get()["attention"]
    open_alarms = [a for a in alarms_recent if a["resolved_at"] is None]
    sev_pts = max((cfg["severity_points"].get(a["severity"], 0) for a in open_alarms), default=0)
    window = now - timedelta(hours=cfg["recent_window_hours"])
    recent = [a for a in alarms_recent if a["triggered_at"] >= window]
    recent_pts = min(len(recent) * cfg["points_per_recent_alarm"], cfg["recent_cap"])
    unacked = [a for a in open_alarms if a["acknowledged_at"] is None]
    oldest_min = max(((now - a["triggered_at"]).total_seconds() / 60 for a in unacked), default=0)
    unack_pts = min(oldest_min * cfg["points_per_minute_unacknowledged"], cfg["unacknowledged_cap"])
    rep_window = timedelta(minutes=settings_store.get()["repeat_window_minutes"])
    ordered = sorted(recent, key=lambda a: a["triggered_at"])
    repeats, last_seen = 0, {}
    for a in ordered:
        prev = last_seen.get(a["alarm_type"])
        if prev and a["triggered_at"] - prev <= rep_window:
            repeats += 1
        last_seen[a["alarm_type"]] = a["triggered_at"]
    rep_pts = min(repeats * cfg["points_per_repeat"], cfg["repeat_cap"])
    total = round(sev_pts + recent_pts + unack_pts + rep_pts)
    return {
        "label": "Operational Attention Indicator — Demo Only",
        "score": int(min(total, 100)),
        "factors": [
            {"factor": "Highest unresolved alarm severity", "value": max(open_alarms, key=lambda a: d.SEVERITY_RANK[a["severity"]])["severity"] if open_alarms else "none", "points": sev_pts},
            {"factor": f"Alarms in last {cfg['recent_window_hours']} h", "value": len(recent), "points": recent_pts},
            {"factor": "Minutes oldest alarm unacknowledged", "value": round(oldest_min, 1), "points": round(unack_pts, 1)},
            {"factor": f"Repeat alarms (same type within {settings_store.get()['repeat_window_minutes']} min)", "value": repeats, "points": rep_pts},
        ],
    }
