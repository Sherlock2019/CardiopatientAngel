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
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5180,http://localhost:8081").split(",") if o.strip()]
# Timezone used to generate synthetic day/night patterns and as the default display timezone.
HOSPITAL_TZ = os.getenv("HOSPITAL_TZ", "America/New_York")
SEED_RANDOM = int(os.getenv("SEED_RANDOM", "42"))
# CardioInsight LLM: any OpenAI-compatible endpoint (local Ollama via the supply-chain relay). Empty = deterministic only.
INSIGHT_LLM_BASE_URL = os.getenv("INSIGHT_LLM_BASE_URL", "").strip()
INSIGHT_LLM_MODEL = os.getenv("INSIGHT_LLM_MODEL", "qwen2.5:7b")
INSIGHT_LLM_TIMEOUT = float(os.getenv("INSIGHT_LLM_TIMEOUT", "90"))
# Flowise (the supply-chain stack's instance) for the CardioInsight chatflow. Key stays server-side.
FLOWISE_URL = os.getenv("FLOWISE_URL", "").strip().rstrip("/")            # as seen from the backend container
FLOWISE_UI_URL = os.getenv("FLOWISE_UI_URL", "").strip().rstrip("/")      # as opened in the user's browser
FLOWISE_API_KEY = os.getenv("FLOWISE_API_KEY", "").strip()
FLOWISE_CHATFLOW = os.getenv("FLOWISE_CHATFLOW", "CardioInsight-Operations-Chatflow-v1")
# Repository root (read-only) for the Engineering Hub: docs, ADRs, test evidence, source traceability.
REPO_DIR = Path(os.getenv("REPO_DIR", Path(__file__).resolve().parents[2]))
DOCS_DIR = REPO_DIR / "docs"
