"""Patient/alarm APIs, role-based authorization, audit trail, ingestion (duplicates & missing data)."""
from datetime import datetime, timedelta, timezone


def test_health(client):
    assert client.get("/health").json()["database"] == "ok"


def test_requires_authentication(client):
    assert client.get("/api/patients").status_code == 401
    assert client.get("/api/patients", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_patient_list_and_detail(client, nurse):
    lst = client.get("/api/patients?status=active", headers=nurse).json()
    assert lst["total"] == 2 and lst["items"][0]["patient_id"] == "P00002"  # most alarms in 24 h first
    d = client.get("/api/patients/P00001", headers=nurse).json()
    assert d["age_group"] == "80-89" and d["discharge_outcome"] == "Deceased"
    assert {x["pathology_name"] for x in d["diagnoses"]} == {"Heart failure"}
    assert len(d["medications"]) == 2
    assert client.get("/api/patients/P99999", headers=nurse).status_code == 404
    assert client.get("/api/patients/DROP%20TABLE", headers=nurse).status_code == 422


def test_patient_measurements_and_alarms(client, nurse):
    m = client.get("/api/patients/P00002/measurements?hours=24", headers=nurse).json()
    assert m["items"][0]["unit"] == "bpm" and m["quality_counts"] == {"valid": 1}
    a = client.get("/api/patients/P00001/alarms", headers=nurse).json()["items"]
    assert len(a) == 3


def test_alarm_queue_enrichment(client, nurse):
    items = client.get("/api/alarms?status=active", headers=nurse).json()["items"]
    assert len(items) == 1
    al = items[0]
    assert al["patient_id"] == "P00002" and al["age"] >= 45
    assert al["current_measurement"]["value"] == 72
    assert al["attention"]["label"].endswith("Demo Only")
    assert {f["factor"] for f in al["attention"]["factors"]} >= {"Highest unresolved alarm severity"}
    assert client.get("/api/alarms?severity=bogus", headers=nurse).status_code == 422


def test_acknowledge_creates_audit_record(client, nurse, admin):
    aid = client.get("/api/alarms?status=unacknowledged", headers=nurse).json()["items"][0]["alarm_id"]
    r = client.post(f"/api/alarms/{aid}/acknowledge", json={"note": "at bedside"}, headers=nurse)
    assert r.status_code == 200 and r.json()["acknowledged_by"] == "RN A. Moreau"
    assert client.post(f"/api/alarms/{aid}/acknowledge", json={}, headers=nurse).status_code == 409
    assert client.get("/api/dashboard/summary", headers=nurse).json()["unacknowledged_alarms"] == 0
    audit = client.get(f"/api/audit?resource_id={aid}", headers=admin).json()
    assert audit[0]["action"] == "acknowledge_alarm" and audit[0]["username"] == "nurse.moreau"


def test_patient_view_is_audited(client, doctor, admin):
    client.get("/api/patients/P00002", headers=doctor)
    audit = client.get("/api/audit?action=view_patient_record", headers=admin).json()
    assert audit[0]["resource_id"] == "P00002" and audit[0]["role"] == "doctor"


def test_resolve_with_review(client, doctor):
    aid = client.get("/api/alarms?status=active", headers=doctor).json()["items"][0]["alarm_id"]
    assert client.post(f"/api/alarms/{aid}/resolve", json={"disposition": "Made up"}, headers=doctor).status_code == 422
    r = client.post(f"/api/alarms/{aid}/resolve", json={"disposition": "Transient / self-resolved", "notes": "ok"}, headers=doctor)
    assert r.status_code == 200 and r.json()["clinical_review_status"] == "reviewed"
    d = client.get("/api/patients/P00002", headers=doctor).json()
    assert d["reviews"][0]["disposition"] == "Transient / self-resolved"


def test_role_based_authorization(client, nurse, doctor, admin):
    assert client.post("/api/simulator/start", headers=nurse).status_code == 403
    assert client.post("/api/simulator/stop", headers=doctor).status_code == 403
    assert client.get("/api/audit", headers=nurse).status_code == 403
    assert client.put("/api/settings", json={"repeat_window_minutes": 30}, headers=doctor).status_code == 403
    aid = client.get("/api/alarms?status=active", headers=admin).json()["items"][0]["alarm_id"]
    assert client.post(f"/api/alarms/{aid}/acknowledge", json={}, headers=admin).status_code == 403
    assert client.post("/api/ingest/measurements", json=[], headers=nurse).status_code == 403


def test_ingestion_duplicates_missing_and_thresholds(client, admin):
    t = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=1)
    reading = {"patient_id": "P00002", "measurement_type": "heart_rate", "value": 150, "observed_at": t.isoformat()}
    r1 = client.post("/api/ingest/measurements", json=[reading], headers=admin).json()
    assert r1["created"] == 1 and r1["alarms_created"] == 1
    r2 = client.post("/api/ingest/measurements", json=[reading, reading], headers=admin).json()
    assert r2["created"] == 0 and r2["duplicates_ignored"] == 2 and r2["alarms_created"] == 0
    missing = {"patient_id": "P00002", "measurement_type": "spo2", "value": None, "observed_at": t.isoformat()}
    r3 = client.post("/api/ingest/measurements", json=[missing], headers=admin).json()
    assert r3["created"] == 1 and r3["missing_values"] == 1 and r3["alarms_created"] == 0
    q = client.get("/api/patients/P00002/measurements?hours=1", headers=admin).json()["quality_counts"]
    assert q.get("missing") == 1
    late = {"patient_id": "P00002", "measurement_type": "systolic_bp", "value": 120,
            "observed_at": (t - timedelta(minutes=30)).isoformat(), "received_at": t.isoformat()}
    client.post("/api/ingest/measurements", json=[late], headers=admin)
    q = client.get("/api/patients/P00002/measurements?hours=2", headers=admin).json()["quality_counts"]
    assert q.get("delayed") == 1
    naive = {**reading, "observed_at": "2026-01-01T10:00:00"}
    bad = client.post("/api/ingest/measurements", json=[naive], headers=admin)
    assert bad.status_code == 422 and "2026-01-01" not in bad.text  # validation errors never echo input values


def test_simulator_start_stop(client, admin):
    with client:  # run lifespan so the event loop is bound
        r = client.post("/api/simulator/start", json={"interval_seconds": 5}, headers=admin)
        assert r.status_code == 200 and r.json()["running"] is True
        assert client.post("/api/simulator/stop", headers=admin).json()["running"] is False
