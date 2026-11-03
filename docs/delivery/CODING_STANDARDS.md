# Coding standards

## Healthcare-specific rules (non-negotiable)

1. **No PHI outside the clinical data store.** Never in logs, metrics, traces, error messages, test fixtures, tickets or screenshots. Tests and demos use synthetic data only.
2. **Time:** store and compare timezone-aware UTC; keep the device timestamp (`observed_at`) and receive timestamp (`received_at`) separately; convert to local time only for display.
3. **Idempotency:** every ingestion path tolerates re-delivery (natural keys or event ids). No "exactly once" assumptions.
4. **Never show missing, stale or implausible data as normal.** Quality flags travel with the value to the UI.
5. **Alarms come from clinician-approved rules or the source device**, never from an unvalidated model; any AI output carries its model version and goes to clinician review.
6. **Every clinical action is audited** in the same transaction as the action (`audit.record`).
7. **Severity and status are never colour alone:** icon + text label + colour.
8. **Analytics say what they are:** descriptive, exposure-adjusted, small cohorts flagged, no causal wording.

## Python (backend)

- Python 3.12, type hints on public functions, Pydantic models at every API boundary with explicit bounds.
- SQLAlchemy with bound parameters only; no string-built SQL from user input.
- Authorization through `require(permission)` on every route; deny by default.
- Formatting and linting: ruff (format + lint) in CI; functions short enough to test; no bare `except` without a reason.
- Database changes only through Alembic migrations, backward compatible for one release.

## TypeScript (frontend / mobile)

- `strict` TypeScript; no `any` in new code except at third-party edges.
- Server state through TanStack Query; no ad-hoc fetch in components.
- Accessible components: labelled controls, keyboard reachable, table view for every chart.
- Tokens never in `localStorage`; idle timeout stays on.

## Tests

- Each requirement ID has at least one automated test; test names describe the behaviour.
- Clinical logic (rules, exposure, attribution) gets exact, hand-checkable fixtures.
- Bug fixes start with a failing test.

## Workflow

- Branch per story (`CW-123-short-name`); commits and PR titles reference the story and requirement IDs.
- PR checklist: tests added, risk register touched if behaviour changed, no PHI, screenshots of UI changes (synthetic data).
- One approving review; two for changes to alarm rules, ingestion, auth or audit.
