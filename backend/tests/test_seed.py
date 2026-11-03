"""Synthetic generator: reproducibility and realism features (no database needed)."""
from datetime import datetime, timezone

from app import domain as d
from app.seed import Generator

ANCHOR = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)


def test_generator_is_reproducible():
    a = Generator(7, ANCHOR, n_patients=60).run()
    b = Generator(7, ANCHOR, n_patients=60).run()
    assert [x["triggered_at"] for x in a.alarms] == [x["triggered_at"] for x in b.alarms]
    assert [p["synthetic_name"] for p in a.patients] == [p["synthetic_name"] for p in b.patients]


def test_generator_realism_features():
    g = Generator(42, ANCHOR, n_patients=150).run()
    assert g.duplicates_dropped > 0  # duplicated events were generated and dropped by the idempotency key
    q = {m["quality_status"] for m in g.measurements.values()}
    assert {"valid", "missing", "delayed", "artifact"} <= q
    per_patient = {}
    for a in g.alarms:
        per_patient[a["patient_id"]] = per_patient.get(a["patient_id"], 0) + 1
    assert max(per_patient.values()) >= 5  # repeated alarms from the same patient
    assert any(a["acknowledged_at"] is None for a in g.alarms)
    assert {p["discharge_outcome"] for p in g.patients} >= {"Deceased", "Discharged alive", None}
    assert len({p["care_unit"] for p in g.patients}) == len(d.CARE_UNITS)


def test_threshold_rules():
    assert d.evaluate_threshold("heart_rate", 150) == ("HR high", "critical")
    assert d.evaluate_threshold("heart_rate", 45) == ("HR low", "warning")
    assert d.evaluate_threshold("spo2", 88) == ("SpO2 low", "warning")
    assert d.evaluate_threshold("heart_rate", 75) is None
    assert d.evaluate_threshold("spo2", None) is None
    assert d.age_group(49) == "<50" and d.age_group(90) == "90+" and d.age_group(73) == "70-79"
