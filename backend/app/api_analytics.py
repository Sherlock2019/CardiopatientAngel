"""Population analytics API. Every response carries the synthetic-data / non-causal disclaimer."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from . import analytics as an
from . import domain as d
from .auth import User, require

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

NOTE = "Synthetic demonstration data. Descriptive associations only — not causal and not clinically validated."
OVERLAP_NOTE = "Patients can have several diagnoses, so diagnosis cohorts overlap and counts do not sum to the total."
CAUSAL_NOTE = "Associations between treatments/medications and alarms do not establish treatment effects or causation."


class Common:
    def __init__(
        self,
        date_from: date | None = None,
        date_to: date | None = None,
        tz: str | None = Query(None, max_length=40),
        unit: list[str] = Query(default=[]),
        alarm_type: list[str] = Query(default=[]),
        severity: list[str] = Query(default=[]),
    ):
        _check(unit, d.CARE_UNITS, "unit")
        _check(alarm_type, d.ALARM_TYPES, "alarm_type")
        _check(severity, d.SEVERITIES, "severity")
        if date_from and date_to and date_from > date_to:
            raise HTTPException(422, "date_from must be on or before date_to")
        self.F = an.frames()
        try:
            self.w = an.make_window(self.F, date_from, date_to, tz)
        except Exception:
            raise HTTPException(422, "Unknown timezone")
        self.units, self.alarm_types, self.severities = unit or None, alarm_type or None, severity or None

    def meta(self) -> dict:
        return {"window": {"from": self.w.lo.isoformat(), "to": self.w.hi.isoformat(), "timezone": self.w.tz}, "note": NOTE}


def _check(values, allowed, name):
    bad = [v for v in values if v not in allowed]
    if bad:
        raise HTTPException(422, f"Unknown {name}: {', '.join(bad)}")


viewer = require("view_analytics")


@router.get("/by-age")
def by_age(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), "rows": an.by_age(c.F, c.w, c.units, c.alarm_types, c.severities)}


@router.get("/by-pathology")
def by_pathology(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), "overlap_note": OVERLAP_NOTE,
            "rows": an.by_dimension(c.F, c.w, "pathology", c.units, c.alarm_types, c.severities)}


@router.get("/by-treatment")
def by_treatment(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), "causal_note": CAUSAL_NOTE,
            "rows": an.by_dimension(c.F, c.w, "treatment", c.units, c.alarm_types, c.severities)}


@router.get("/by-medication")
def by_medication(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), "causal_note": CAUSAL_NOTE,
            "rows": an.by_dimension(c.F, c.w, "medication", c.units, c.alarm_types, c.severities),
            "matrix": an.medication_alarm_matrix(c.F, c.w, c.units)}


@router.get("/age-pathology")
def age_pathology(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), "overlap_note": OVERLAP_NOTE, "cells": an.age_pathology_matrix(c.F, c.w, c.units)}


@router.get("/hourly-heatmap")
def hourly_heatmap(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), **an.heatmap(c.F, c.w, c.units, c.alarm_types, c.severities)}


@router.get("/trends")
def trends(c: Common = Depends(), granularity: str = Query("day", pattern="^(day|week)$"), user: User = Depends(viewer)):
    return {**c.meta(), "granularity": granularity, "rows": an.trends(c.F, c.w, granularity, c.units)}


@router.get("/staffing")
def staffing(c: Common = Depends(), user: User = Depends(viewer)):
    return {**c.meta(), **an.staffing(c.F, c.w, c.units)}


@router.get("/outcomes")
def outcomes(c: Common = Depends(), user: User = Depends(viewer)):
    """Deceased vs. discharged-alive comparison across age, disease, treatment, medication, unit and alarm burden."""
    return {**c.meta(), **an.outcomes(c.F, c.w, c.units)}


def _filter_from(request: Request, prefix: str = "") -> an.CohortFilter:
    qp = request.query_params

    def lst(name, allowed):
        vals = qp.getlist(prefix + name)
        _check(vals, allowed, prefix + name)
        return vals

    hours = []
    for h in qp.getlist(prefix + "hour"):
        if not h.isdigit() or not 0 <= int(h) <= 23:
            raise HTTPException(422, f"Invalid {prefix}hour")
        hours.append(int(h))
    return an.CohortFilter(
        age_groups=lst("age_group", d.AGE_GROUPS), pathologies=lst("pathology", list(d.PATHOLOGIES)),
        medication_classes=lst("medication_class", d.MEDICATION_CLASSES), treatments=lst("treatment", d.TREATMENTS),
        units=lst("unit", d.CARE_UNITS), alarm_types=lst("alarm_type", d.ALARM_TYPES),
        severities=lst("severity", d.SEVERITIES), hours=hours)


@router.get("/cohorts")
def cohorts(request: Request, date_from: date | None = None, date_to: date | None = None,
            tz: str | None = Query(None, max_length=40), user: User = Depends(viewer)):
    """Cohort explorer. Filters: age_group, pathology, medication_class, treatment, unit, alarm_type,
    severity, hour (repeatable). Reference cohort: same names prefixed with `ref_`; default = all
    monitored patients with the same alarm-type/severity/hour filters."""
    F = an.frames()
    try:
        w = an.make_window(F, date_from, date_to, tz)
    except Exception:
        raise HTTPException(422, "Unknown timezone")
    f = _filter_from(request)
    ref = _filter_from(request, "ref_")
    if ref.is_empty():
        ref = an.CohortFilter([], [], [], [], [], f.alarm_types, f.severities, f.hours)
    return {
        "window": {"from": w.lo.isoformat(), "to": w.hi.isoformat(), "timezone": w.tz},
        "note": NOTE,
        "method_note": "Exposure counts only time when every selected diagnosis/medication/treatment was valid; "
                       "hour-of-day filters scale exposure by the fraction of hours selected.",
        "cohort": an.cohort(F, w, f),
        "reference": an.cohort(F, w, ref, with_patients=False),
    }
