"""Device fleet, virtual-care integration outbox and tamper-evident audit chain."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.db import SessionLocal
from app.models import AuditLog, Device


def test_device_fleet_health(client, nurse):
    r = client.get("/api/devices", headers=nurse).json()
    assert r["total"] == 1  # returned devices are excluded
    dev = r["items"][0]
    assert dev["device_id"] == "TEL-0002" and dev["health"] == "low_battery" and dev["care_unit"] == "Telemetry Ward A"
    with SessionLocal() as db:
        db.execute(update(Device).where(Device.device_id == "TEL-0002")
                   .values(battery_pct=80, last_sync_at=datetime.now(timezone.utc) - timedelta(hours=2)))
        db.commit()
    r = client.get("/api/devices?health=offline", headers=nurse).json()
    assert r["summary"]["offline"] == 1 and r["items"][0]["minutes_since_sync"] > 100
    assert client.get("/api/devices?device_type=Toaster", headers=nurse).status_code == 422


def test_patient_detail_includes_device(client, doctor):
    d = client.get("/api/patients/P00002", headers=doctor).json()
    assert d["device"]["model"] == "TX-12" and d["device"]["signals"]


def test_consult_request_emits_outbox_event_and_audit(client, nurse, admin):
    aid = client.get("/api/alarms?status=active", headers=nurse).json()["items"][0]["alarm_id"]
    r = client.post(f"/api/alarms/{aid}/consult-request", json={"urgency": "urgent"}, headers=nurse)
    assert r.status_code == 200 and r.json()["status"] == "consult_requested"
    ev = client.get("/api/integration/events", headers=nurse).json()
    assert ev["items"][0]["event_type"] == "consult.requested"
    assert ev["items"][0]["payload"]["urgency"] == "urgent" and ev["items"][0]["status"] == "pending"
    assert client.get(f"/api/audit?resource_id={aid}&action=request_virtual_consult", headers=admin).json()
    assert client.post(f"/api/alarms/{aid}/consult-request", json={}, headers=admin).status_code == 403
    assert client.post(f"/api/alarms/{aid}/consult-request", json={"urgency": "now!"}, headers=nurse).status_code == 422


def test_acknowledge_emits_outbox_event(client, nurse):
    aid = client.get("/api/alarms?status=unacknowledged", headers=nurse).json()["items"][0]["alarm_id"]
    client.post(f"/api/alarms/{aid}/acknowledge", json={}, headers=nurse)
    ev = client.get("/api/integration/events", headers=nurse).json()["items"]
    assert ev[0]["event_type"] == "alarm.acknowledged" and ev[0]["payload"]["alarm_id"] == aid


def test_audit_hash_chain_detects_tampering(client, nurse, doctor, admin):
    client.get("/api/patients/P00001", headers=nurse)
    client.get("/api/patients/P00002", headers=doctor)
    ok = client.get("/api/audit/verify", headers=admin).json()
    assert ok["valid"] is True and ok["entries_checked"] == 2
    with SessionLocal() as db:  # someone edits history directly in the database
        first = db.query(AuditLog).order_by(AuditLog.audit_id).first()
        first.username = "someone.else"
        db.commit()
        broken_id = first.audit_id
    bad = client.get("/api/audit/verify", headers=admin).json()
    assert bad["valid"] is False and bad["first_broken_audit_id"] == broken_id
    assert client.get("/api/audit/verify", headers=nurse).status_code == 403


def test_device_profiles_are_product_templates(client, nurse):
    profiles = {p["device_type"]: p for p in client.get("/api/device-profiles", headers=nurse).json()}
    ring = profiles["Biosensor ring"]
    assert {s["key"] for s in ring["signals"]} == {"heart_rate", "spo2", "sleep_hours"}
    assert next(s for s in ring["signals"] if s["key"] == "heart_rate")["loinc"] == "8867-4"
    assert "BP high" not in {r["alarm_type"] for r in ring["alarm_rules"]}
    fall = next(r for r in profiles["Cuffless BP monitor"]["alarm_rules"] if r["alarm_type"] == "Fall detected")
    assert fall["source"] == "device event"


def test_implausible_values_flagged_not_alarmed(client, admin):
    t = (datetime.now(timezone.utc) - timedelta(minutes=2)).replace(microsecond=0).isoformat()
    r = client.post("/api/ingest/measurements", headers=admin,
                    json=[{"patient_id": "P00002", "measurement_type": "heart_rate", "value": 350, "observed_at": t}]).json()
    assert r["created"] == 1 and r["artifacts_flagged"] == 1 and r["alarms_created"] == 0
    q = client.get("/api/patients/P00002/measurements?hours=1", headers=admin).json()["quality_counts"]
    assert q.get("artifact") == 1


def test_by_device_analytics(client, doctor):
    rows = {r["device_type"]: r for r in client.get("/api/analytics/by-device", headers=doctor).json()["rows"]}
    assert rows["Bedside monitor"]["alarms"] == 3 and rows["Telemetry pack"]["alarms"] == 1
    assert rows["Bedside monitor"]["technical_alarms"] == 0
