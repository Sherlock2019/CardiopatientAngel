#!/usr/bin/env bash
# Run every test suite and write genuine JUnit results + metadata to docs/delivery/evidence/.
# The Engineering Hub and Lifecycle pages read these files; nothing in them is hand-edited.
# Requires: database running (docker compose up -d db) and, for E2E, the app on :5180.
set -u
cd "$(dirname "$0")/.."
EV=docs/delivery/evidence
mkdir -p "$EV"

(cd backend && uv run pytest -q -p no:warnings --junitxml="../$EV/backend-junit.xml") | tail -1
(cd frontend && npx vitest run --reporter=default --reporter=junit --outputFile.junit="../$EV/frontend-junit.xml") | grep -E "Tests " || true
(cd frontend && PLAYWRIGHT_JUNIT_OUTPUT_NAME="../$EV/e2e-junit.xml" npx playwright test acknowledge-workflow --reporter=junit >/dev/null; echo "e2e exit $?")

(cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi(), indent=1))") > docs/engineering/api/openapi.json

cat > "$EV/meta.json" <<EOF
{"commit": "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)",
 "dirty": $( [ -n "$(git status --porcelain 2>/dev/null)" ] && echo true || echo false ),
 "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
 "runner": "scripts/collect_evidence.sh (same commands as .github/workflows/ci.yml)"}
EOF
echo "evidence written to $EV"
