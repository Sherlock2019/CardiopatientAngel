"""Aggregation accuracy and monitoring-exposure calculations on hand-built data (see conftest)."""
import pytest

from app import analytics as an
from app.analytics import CohortFilter


def _rows(client, headers, path, key):
    return {r[key]: r for r in client.get(path, headers=headers).json()["rows"]}


def test_exposure_and_rates_by_age(client, doctor):
    rows = _rows(client, doctor, "/api/analytics/by-age", "age_group")
    a, b = rows["80-89"], rows["<50"]
    assert a["patients"] == 1 and a["alarms"] == 3 and a["critical"] == 2
    assert a["exposure_days"] == pytest.approx(5.0, abs=0.01)
    assert a["rate_per_100_patient_days"] == pytest.approx(60.0, abs=0.1)
    assert b["exposure_days"] == pytest.approx(2.0, abs=0.01)
    assert b["rate_per_100_patient_days"] == pytest.approx(50.0, abs=0.5)
    assert b["pct_patients_with_alarm"] == 100.0
    assert rows["60-69"]["patients"] == 0  # empty groups are still listed


def test_pathology_uses_time_valid_exposure(client, doctor):
    rows = _rows(client, doctor, "/api/analytics/by-pathology", "key")
    hf = rows["Heart failure"]
    # Diagnosed mid-stay: only 2 of the 5 monitored days, and the alarm before diagnosis is excluded.
    assert hf["exposure_days"] == pytest.approx(2.0, abs=0.01)
    assert hf["alarms"] == 2
    # Bradycardia was resolved before admission -> no exposure at all.
    assert "Bradycardia" not in rows


def test_overlapping_medication_orders_not_double_counted(client, doctor):
    rows = _rows(client, doctor, "/api/analytics/by-medication", "key")
    assert rows["Diuretics"]["exposure_days"] == pytest.approx(5.0, abs=0.01)
    assert rows["Diuretics"]["alarms"] == 3


def test_repeat_alarm_detection_and_summary(client, nurse):
    s = client.get("/api/dashboard/summary", headers=nurse).json()
    assert s["monitored_patients"] == 2  # P00002 (ward) + P00003 (remote monitoring)
    assert s["active_alarms"] == 1 and s["unacknowledged_alarms"] == 1
    F = an.frames()
    assert int(F.alarms["is_repeat"].sum()) == 1  # t3 repeats t2 within 120 min


def test_heatmap_counts_sum_to_total(client, doctor):
    cells = client.get("/api/analytics/hourly-heatmap?tz=UTC", headers=doctor).json()["cells"]
    assert len(cells) == 7 * 24
    assert sum(c["alarms"] for c in cells) == 4
    # patient-hours ~ (5 + 2 + 12) days * 24 h
    assert sum(c["patient_hours"] for c in cells) == pytest.approx(19 * 24, abs=3)


def test_cohort_intersection_of_filters():
    F = an.frames()
    w = an.make_window(F, None, None, "UTC")
    f = CohortFilter(age_groups=["80-89"], pathologies=["Heart failure"], medication_classes=["Diuretics"],
                     treatments=[], units=[], alarm_types=[], severities=[], hours=[])
    out = an.cohort(F, w, f)
    assert out["patients"] == 1
    assert out["exposure_days"] == pytest.approx(2.0, abs=0.01)
    assert out["alarms"] == 2 and out["critical"] == 2
    empty = an.cohort(F, w, CohortFilter(["<50"], ["Heart failure"], [], [], [], [], [], []))
    assert empty["patients"] == 0 and empty["alarms"] == 0 and empty["rate_per_100_patient_days"] is None


def test_small_cohort_suppression(client, doctor, admin):
    r = client.put("/api/settings", json={"suppress_cohort_patients": 5, "small_cohort_patients": 20}, headers=admin)
    assert r.status_code == 200
    rows = _rows(client, doctor, "/api/analytics/by-age", "age_group")
    assert rows["80-89"]["suppressed"] is True and rows["80-89"]["rate_per_100_patient_days"] is None


def test_outcomes_comparison(client, doctor):
    out = client.get("/api/analytics/outcomes", headers=doctor).json()
    assert out["completed_stays"] == 1 and out["deceased"]["patients"] == 1 and out["alive"]["patients"] == 0
    disease = next(d for d in out["dimensions"] if d["dimension"] == "Disease")["rows"]
    hf = next(r for r in disease if r["category"] == "Heart failure")
    assert hf["deceased_n"] == 1 and hf["mortality_pct"] == 100.0
    assert any("cannot show what prevents death" in c for c in out["caveats"])
    signs = {r["category"]: r for r in next(d for d in out["dimensions"] if d["dimension"] == "Signs during stay")["rows"]}
    assert signs["Fast heart rate"]["deceased_n"] == 1 and signs["Low blood pressure"]["deceased_n"] == 1  # P00001's alarms
    assert signs["Low oxygen"]["patients"] == 0


def test_trends_and_staffing(client, doctor):
    trend = client.get("/api/analytics/trends?granularity=day&tz=UTC", headers=doctor).json()["rows"]
    assert sum(r["alarms"] for r in trend) == 4
    st = client.get("/api/analytics/staffing?tz=UTC", headers=doctor).json()
    assert sum(s["alarms"] for s in st["shifts"]) == 4
    assert st["insights"] and "Not a staffing recommendation" in st["disclaimer"]


def test_analytics_input_validation(client, doctor):
    assert client.get("/api/analytics/by-age?unit=Nowhere", headers=doctor).status_code == 422
    assert client.get("/api/analytics/by-age?tz=Mars/Base", headers=doctor).status_code == 422
    assert client.get("/api/analytics/cohorts?hour=25", headers=doctor).status_code == 422
    assert client.get("/api/analytics/by-age?date_from=2026-02-01&date_to=2026-01-01", headers=doctor).status_code == 422
