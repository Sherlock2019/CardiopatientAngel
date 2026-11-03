"""Test fixtures. Uses a separate PostgreSQL database (TEST_DATABASE_URL), never the demo database."""
import os
from datetime import date, datetime, timedelta, timezone

os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", "postgresql+psycopg://cardiowatch:cardiowatch@localhost:55440/cardiowatch_test"
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import analytics, settings_store  # noqa: E402
from app.config import DOCS_DIR  # noqa: E402
from app.knowledge import seed_from_docs  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Alarm, CardiacMeasurement, Device, Diagnosis, Medication, Patient, Treatment  # noqa: E402

NOW = datetime.now(timezone.utc).replace(microsecond=0)


def _dob(age: int) -> date:
    return date(NOW.year - age - 1, 1, 1)


def build_fixture_data(db):
    """Two patients with exactly known exposure windows, diagnoses, medications and alarms.

    A (P00001): age ~85, monitored now-10d .. now-5d (5 patient-days), deceased.
       Heart failure diagnosed now-7d (mid-stay) -> HF exposure 2 days.
       Diuretics: two overlapping orders now-10d..now-6d and now-8d..now-5d -> merged exposure 5 days.
       Alarms: now-9d (warning), now-6d (critical), now-6d+30min (critical, repeat of same type).
    B (P00002): age ~45, active, monitored now-2d .. now (2 patient-days).
       Bradycardia resolved years before admission -> never counts.
       Alarm: now-1d (warning), unacknowledged.
    """
    A = Patient(patient_id="P00001", synthetic_name="Test Alpha", date_of_birth=_dob(85), sex="F",
                admission_date=NOW - timedelta(days=10), monitoring_end=NOW - timedelta(days=5),
                care_unit="Coronary Care Unit", monitoring_status="discharged", discharge_outcome="Deceased",
                assigned_care_team="Team Red", device_id="BED-0001", device_type="Bedside monitor")
    B = Patient(patient_id="P00002", synthetic_name="Test Beta", date_of_birth=_dob(45), sex="M",
                admission_date=NOW - timedelta(days=2), monitoring_end=None,
                care_unit="Telemetry Ward A", monitoring_status="active", discharge_outcome=None,
                assigned_care_team="Team Blue", device_id="TEL-0002", device_type="Telemetry pack")
    C = Patient(patient_id="P00003", synthetic_name="Test Gamma", date_of_birth=_dob(78), sex="F",
                admission_date=NOW - timedelta(days=12), monitoring_end=None, care_unit="Remote Monitoring",
                monitoring_status="active", discharge_outcome=None, assigned_care_team="Team Gold",
                device_id="CBP-0003", device_type="Cuffless BP monitor")
    db.add_all([A, B, C])
    db.flush()
    db.add(Device(device_id="CBP-0003", device_type="Cuffless BP monitor", model="CB-2 wrist", firmware_version="3.1.0",
                  connectivity="BLE / LTE", battery_pct=25, last_sync_at=NOW - timedelta(minutes=5),
                  status="in_use", patient_id="P00003"))
    db.add(Medication(patient_id="P00003", medication_name="Metoprolol", medication_class="Beta blockers",
                      prescribed_dose="25 mg BID", route="PO", start_time=NOW - timedelta(days=12), end_time=None, status="active"))
    db.add(CardiacMeasurement(patient_id="P00003", device_id="CBP-0003", measurement_type="heart_rate", numeric_value=68,
                              unit="bpm", observed_at=NOW - timedelta(hours=3), received_at=NOW - timedelta(hours=3),
                              quality_status="valid"))
    db.add_all([
        Device(device_id="BED-0001", device_type="Bedside monitor", model="BM-500", firmware_version="4.2.1",
               connectivity="Wired / Wi-Fi", battery_pct=None, last_sync_at=NOW - timedelta(days=5),
               status="returned", patient_id="P00001"),
        Device(device_id="TEL-0002", device_type="Telemetry pack", model="TX-12", firmware_version="2.9.0",
               connectivity="Wi-Fi", battery_pct=12, last_sync_at=NOW - timedelta(minutes=2),
               status="in_use", patient_id="P00002"),
    ])
    db.add_all([
        Diagnosis(patient_id="P00001", diagnosis_code="I50.9", pathology_name="Heart failure",
                  diagnosis_date=NOW - timedelta(days=7), active_status=True),
        Diagnosis(patient_id="P00002", diagnosis_code="R00.1", pathology_name="Bradycardia",
                  diagnosis_date=NOW - timedelta(days=2000), resolved_date=NOW - timedelta(days=1900), active_status=False),
        Medication(patient_id="P00001", medication_name="Furosemide", medication_class="Diuretics", prescribed_dose="40 mg",
                   route="IV", start_time=NOW - timedelta(days=10), end_time=NOW - timedelta(days=6), status="stopped"),
        Medication(patient_id="P00001", medication_name="Hydrochlorothiazide", medication_class="Diuretics", prescribed_dose="25 mg",
                   route="PO", start_time=NOW - timedelta(days=8), end_time=NOW - timedelta(days=5), status="completed"),
        Treatment(patient_id="P00001", treatment_type="Medication management", start_date=NOW - timedelta(days=10),
                  end_date=NOW - timedelta(days=5), status="completed"),
    ])
    m = CardiacMeasurement(patient_id="P00002", device_id="TEL-0002", measurement_type="heart_rate", numeric_value=72,
                           unit="bpm", observed_at=NOW - timedelta(minutes=10), received_at=NOW - timedelta(minutes=10),
                           quality_status="valid")
    db.add(m)
    db.flush()

    def alarm(eid, pid, t, sev, atype="HR high", ack=True, resolved=True, mid=None):
        db.add(Alarm(source_event_id=eid, patient_id=pid, measurement_id=mid, alarm_type=atype, severity=sev,
                     trigger_value=125, trigger_unit="bpm", triggered_at=t, received_at=t,
                     acknowledged_at=t + timedelta(minutes=2) if ack else None,
                     resolved_at=t + timedelta(minutes=10) if resolved else None,
                     assigned_nurse="RN A. Moreau", clinical_review_status="resolved" if resolved else "new",
                     source="test", simulated_flag=True))

    alarm("t1", "P00001", NOW - timedelta(days=9), "warning", atype="BP low")
    alarm("t2", "P00001", NOW - timedelta(days=6), "critical")
    alarm("t3", "P00001", NOW - timedelta(days=6) + timedelta(minutes=30), "critical")
    alarm("t4", "P00002", NOW - timedelta(days=1), "warning", ack=False, resolved=False, mid=m.measurement_id)
    db.commit()


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        build_fixture_data(db)
        seed_from_docs(db, DOCS_DIR)
    settings_store.reset()
    settings_store.update({"small_cohort_patients": 1, "suppress_cohort_patients": 0})
    analytics.reset_cache()
    yield
    settings_store.reset()
    analytics.reset_cache()


@pytest.fixture
def client():
    return TestClient(app)


def login(client, username: str) -> dict:
    tok = client.post("/api/auth/login", json={"username": username}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture
def nurse(client):
    return login(client, "nurse.moreau")


@pytest.fixture
def doctor(client):
    return login(client, "dr.chen")


@pytest.fixture
def admin(client):
    return login(client, "admin")


@pytest.fixture
def engineer(client):
    return login(client, "eng.tran")


@pytest.fixture
def lead(client):
    return login(client, "eng.lead")


@pytest.fixture
def patient(client):
    return login(client, "patient.demo")
