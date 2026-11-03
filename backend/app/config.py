"""Runtime configuration. All secrets come from environment variables."""
import os
from pathlib import Path

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://cardiowatch:cardiowatch@localhost:55440/cardiowatch",
)
# Demo-only default; override SECRET_KEY in any shared environment.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-secret-change-me")
TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "12"))
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5180").split(",") if o.strip()]
# Timezone used to generate synthetic day/night patterns and as the default display timezone.
HOSPITAL_TZ = os.getenv("HOSPITAL_TZ", "America/New_York")
SEED_RANDOM = int(os.getenv("SEED_RANDOM", "42"))
# Repository root (read-only) for the Engineering Hub: docs, ADRs, test evidence, source traceability.
REPO_DIR = Path(os.getenv("REPO_DIR", Path(__file__).resolve().parents[2]))
DOCS_DIR = REPO_DIR / "docs"
