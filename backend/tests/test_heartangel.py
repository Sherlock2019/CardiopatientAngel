"""Heart Angel: answers from the record, routes clinical decisions to the physician, audits every question."""
from app import domain as d


def ask(client, headers, q):
    r = client.post("/api/heartangel/ask", json={"question": q}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_patient_medications_and_family_contact(client, nurse):
    r = ask(client, nurse, "What medications is Test Gamma taking?")
    assert r["intent"] == "patient" and r["patients"][0]["patient_id"] == "P00003"
    assert "Metoprolol 25 mg BID" in r["answer"]
    r = ask(client, nurse, "family contact phone for P00002")
    assert "Family contact" in r["answer"] and "Metoprolol" not in r["answer"]


def test_clinical_decisions_are_routed_to_the_doctor(client, nurse):
    r = ask(client, nurse, "Should I increase the dose of metoprolol for Test Gamma?")
    assert r["intent"] == "clinical_decision"
    assert d.TEAM_DOCTOR["Team Gold"] in r["answer"] and "on call" in r["answer"]


def test_medication_condition_and_emergency_lookups(client, nurse):
    assert ask(client, nurse, "who is on metoprolol?")["answer"].startswith("1 monitored patient")
    assert ask(client, nurse, "any emergencies right now?")["intent"] == "emergency"
    assert ask(client, nurse, "who is on call?")["intent"] == "on_call"


def test_heartangel_requires_clinical_role_and_is_audited(client, nurse, engineer):
    assert client.post("/api/heartangel/ask", json={"question": "P00003"}, headers=engineer).status_code == 403
    ask(client, nurse, "Test Gamma")
    log = client.get("/api/audit", headers=nurse)
    if log.status_code == 200:
        items = log.json().get("items", log.json())
        assert any(i.get("action") == "heartangel_ask" for i in items)
