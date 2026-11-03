"""Engineering Hub endpoints and the patient self-service (mobile) API."""


def test_lifecycle_trace(client, engineer, nurse):
    assert client.get("/api/engineering/lifecycle", headers=nurse).status_code == 403
    r = client.get("/api/engineering/lifecycle", headers=engineer).json()
    assert len(r["stages"]) == 7
    f = r["feature"]
    assert f["requirement"]["id"] == "REQ-ING-01" and f["adr"]["id"] == "ADR-003"
    assert all(c["line"] for c in f["code"])  # every referenced symbol exists in the source
    assert {k["status"] for k in f["knowledge_records"]} == {"approved"}


def test_source_viewer_blocks_traversal(client, engineer):
    assert client.get("/api/engineering/source", params={"path": "../../etc/passwd"}, headers=engineer).status_code == 404
    assert client.get("/api/engineering/source", params={"path": "backend/app/config.py.bak"}, headers=engineer).status_code == 404
    ok = client.get("/api/engineering/source", params={"path": "backend/app/ingest.py"}, headers=engineer).json()
    assert "def ingest_measurement" in ok["content"]


def test_operations_and_roles(client, engineer):
    ops = client.get("/api/engineering/operations", headers=engineer).json()
    assert {r["id"] for r in ops["alert_rules"]} == {"ALR-001", "ALR-002", "ALR-003", "ALR-004", "ALR-005"}
    roles = client.get("/api/engineering/roles", headers=engineer).json()
    row = next(p for p in roles["permissions"] if p["permission"] == "view_clinical")
    assert row["nurse"] and not row["engineer"] and not row["eng_lead"]


def test_patient_sees_only_own_record(client, patient, doctor):
    me = client.get("/api/me", headers=patient).json()
    assert me["care_unit"] == "Remote Monitoring" and me["latest"]["heart_rate"]["value"] == 68
    assert client.get("/api/patients", headers=patient).status_code == 403
    assert client.get("/api/patients/P00001", headers=patient).status_code == 403
    meds = client.get("/api/me/medications", headers=patient).json()
    assert meds[0]["times"] == ["08:00", "20:00"]
    assert client.get("/api/me", headers=doctor).status_code == 403


def test_patient_checkin_reaches_care_team(client, patient, doctor):
    assert client.post("/api/me/checkins", json={"feeling": 6, "took_medications": True}, headers=patient).status_code == 422
    assert client.post("/api/me/checkins", json={"feeling": 3, "symptoms": ["Hiccups"], "took_medications": True},
                       headers=patient).status_code == 422
    r = client.post("/api/me/checkins", json={"feeling": 2, "symptoms": ["Shortness of breath"], "took_medications": False},
                    headers=patient).json()
    assert r["ok"] and "emergency" in r["message"]
    d = client.get("/api/patients/P00003", headers=doctor).json()
    assert d["checkins"][0]["symptoms"] == ["Shortness of breath"] and d["checkins"][0]["source"] == "mobile"
    tips = client.get("/api/me/coaching", headers=patient).json()
    assert "battery" in " ".join(tips["messages"]) and tips["disclaimer"]
