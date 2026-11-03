"""Knowledge Hub: access control, redaction, review workflow, retrieval with citations, compounding metrics."""

NEW = {"title": "Pattern for retrying vendor uploads", "summary": "Use exponential backoff and idempotent keys for vendor uploads.",
       "content": "Contact jane.doe@example.com about patient P01234; we decided to retry with backoff. password=hunter2",
       "source_type": "code_review", "access_classification": "internal", "tags": ["retry", "pattern"]}


def test_role_separation_engineers_vs_clinical(client, engineer, nurse):
    assert client.get("/api/knowledge", headers=nurse).status_code == 403
    assert client.get("/api/patients", headers=engineer).status_code == 403  # no PHI for engineering roles
    assert client.get("/api/alarms", headers=engineer).status_code == 403
    assert client.get("/api/knowledge", headers=engineer).status_code == 200


def test_restricted_records_hidden_before_retrieval(client, engineer, lead):
    ids = {r["knowledge_id"] for r in client.get("/api/knowledge", headers=engineer).json()["items"]}
    assert "KB-0011" not in ids and "KB-0001" in ids
    assert client.get("/api/knowledge/KB-0011", headers=engineer).status_code == 404  # existence not revealed
    assert client.get("/api/knowledge/KB-0011", headers=lead).status_code == 200
    ans = client.get("/api/knowledge/ask", params={"q": "break-glass production access procedure"}, headers=engineer).json()
    assert all(c["knowledge_id"] != "KB-0011" for c in ans["citations"] + ans["not_established_guidance"])


def test_assistant_answers_with_citations_from_approved_only(client, engineer):
    ans = client.get("/api/knowledge/ask", params={"q": "How did we resolve duplicated cardiac monitoring alarms?"},
                     headers=engineer).json()
    cited = {c["knowledge_id"] for c in ans["citations"]}
    assert ans["confidence"] in ("high", "medium") and {"KB-0001", "INC-2026-014", "ADR-003"} & cited
    assert all(c["approval_status"] == "approved" for c in ans["citations"])
    auth = client.get("/api/knowledge/ask", params={"q": "What is our approved API authentication pattern?"}, headers=engineer).json()
    assert auth["citations"][0]["knowledge_id"] == "ADR-002"
    assert "KB-0009" not in {c["knowledge_id"] for c in auth["citations"]}  # deprecated never cited as guidance


def test_assistant_admits_insufficient_evidence(client, engineer):
    ans = client.get("/api/knowledge/ask", params={"q": "quarterly marketing budget for billboards"}, headers=engineer).json()
    assert ans["confidence"] == "insufficient" and ans["citations"] == []
    partial = client.get("/api/knowledge/ask", params={"q": "What is the parking policy?"}, headers=engineer).json()
    assert partial["confidence"] in ("insufficient", "low") and "park" in partial["uncovered_terms"]


def test_feature_aware_retrieval(client, engineer):
    ans = client.get("/api/knowledge/ask", params={"q": "Which architecture decisions apply to this feature?", "feature": "CW-102"},
                     headers=engineer).json()
    assert ans["citations"][0]["knowledge_id"] in {"ADR-003", "KB-0001", "INC-2026-014", "KB-0002"}
    assert "ADR-003" in {c["knowledge_id"] for c in ans["citations"]}


def test_submission_is_redacted_classified_and_reviewed(client, engineer, lead):
    r = client.post("/api/knowledge", json=NEW, headers=engineer).json()
    assert r["approval_status"] == "in_review" and set(r["redactions"]) >= {"email", "patient_id", "secret_assignment"}
    assert "jane.doe" not in r["content"] and "P01234" not in r["content"] and "hunter2" not in r["content"]
    kid = r["knowledge_id"]
    assert client.post(f"/api/knowledge/{kid}/review", json={"decision": "approve"}, headers=engineer).status_code == 403
    ok = client.post(f"/api/knowledge/{kid}/review", json={"decision": "approve", "comment": "good"}, headers=lead).json()
    assert ok["approval_status"] == "approved" and ok["review_due_at"]
    detail = client.get(f"/api/knowledge/{kid}", headers=engineer).json()
    assert [v["change_type"] for v in detail["revisions"]] == ["created", "submitted", "approved"]


def test_separation_of_duties(client, lead):
    r = client.post("/api/knowledge", json=NEW, headers=lead).json()
    assert client.post(f"/api/knowledge/{r['knowledge_id']}/review", json={"decision": "approve"}, headers=lead).status_code == 403


def test_edit_creates_new_version_and_returns_to_review(client, engineer):
    body = {**NEW, "title": "Idempotent ingestion pattern (updated)", "summary": "Updated summary for the ingestion pattern."}
    r = client.put("/api/knowledge/KB-0001", json=body, headers=engineer).json()  # eng.tran owns KB-0001
    assert r["version"] == 2 and r["approval_status"] == "in_review"
    assert client.delete("/api/knowledge/KB-0001", headers=engineer).status_code == 405  # nothing is deleted


def test_reuse_and_metrics(client, engineer):
    assert client.post("/api/knowledge/KB-0010/reuse", json={"feature": "CW-205"}, headers=engineer).status_code == 409  # draft
    assert client.post("/api/knowledge/KB-0001/reuse", json={"feature": "CW-205"}, headers=engineer).status_code == 200
    m = client.get("/api/knowledge/metrics", headers=engineer).json()
    assert m["reuse_events"] == 1 and m["approved_records"] >= 15
    assert m["repeated_incident_categories"]["duplicate-events"] >= 2
    assert "KB-0012" in m["due_for_review"]
    assert 0 < m["onboarding_coverage"]["pct"] < 100
