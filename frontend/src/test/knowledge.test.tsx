import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgeHub from "../pages/KnowledgeHub";
import { USER, mockFetch, renderPage } from "./utils";

const ENGINEER = { ...USER, username: "eng.tran", display_name: "Engineer B. Tran", role: "engineer", permissions: ["view_engineering", "view_knowledge", "submit_knowledge"] };
const METRICS = { approved_records: 18, linked_to_features: 9, retrieval_events: 3, reuse_events: 1, due_for_review: ["KB-0012"],
  repeated_incident_categories: { "duplicate-events": 3, "time-handling": 2 }, onboarding_coverage: { pct: 50, covered: ["local-setup"], required: ["local-setup", "release"] },
  note: "Counts only.", by_status: { draft: 1, in_review: 0, approved: 18, rejected: 0, deprecated: 1 } };
const hit = (id: string, status = "approved") => ({ knowledge_id: id, title: `Title ${id}`, summary: "s", approval_status: status, version: 1,
  snippet: "we «deduplicate» on natural keys", coverage: 1, review_due: false, access_classification: "internal" });
const ANSWER = { question: "q", confidence: "high", answer: "Approved guidance from 1 record(s):\n- Pattern [KB-0001 v1]: dedupe",
  citations: [hit("KB-0001")], weak_matches: [], not_established_guidance: [hit("KB-0010", "draft")], uncovered_terms: [], method: "full-text" };

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("asks the assistant and shows citations, confidence and non-guidance separately", async () => {
  const spy = mockFetch({
    "/api/auth/me": ENGINEER, "/api/knowledge/metrics": METRICS, "/api/knowledge/categories": { categories: [], statuses: [] },
    "/api/knowledge/ask": ANSWER, "/api/knowledge": { items: [] },
  });
  renderPage(<KnowledgeHub />, { route: "/knowledge", path: "/knowledge" });
  expect(await screen.findByText("Approved records")).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: /Review queue/ })).not.toBeInTheDocument(); // engineers cannot review
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
  expect(await screen.findByText("confidence: high")).toBeInTheDocument();
  expect(screen.getByText("KB-0001 v1")).toBeInTheDocument();
  expect(screen.getByText("deduplicate", { selector: "mark" })).toBeInTheDocument();
  expect(screen.getByText("Also matched, but not established guidance")).toBeInTheDocument();
  expect(screen.getByText("✎ draft")).toBeInTheDocument();
  await waitFor(() => expect(spy.mock.calls.some(([u]) => String(u).startsWith("/api/knowledge/ask?q="))).toBe(true));
});
