"""CardioWatch AI — FastAPI application."""
import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from datetime import datetime, timezone

from . import api, api_analytics, api_engineering, api_insight, api_knowledge, api_patient, heartangel, integration
from .config import CORS_ORIGINS
from .db import engine
from .simulator import bus, heartbeat_loop, simulator

# Logs carry request ids, route templates and exception types only — never patient data.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("cardiowatch")


@asynccontextmanager
async def lifespan(app: FastAPI):
    bus.loop = asyncio.get_running_loop()
    relay = asyncio.create_task(integration.relay_loop())
    heartbeat = asyncio.create_task(heartbeat_loop())
    yield
    relay.cancel()
    heartbeat.cancel()
    await simulator.stop()


app = FastAPI(
    title="CardioWatch AI API",
    version="0.1.0",
    description="From Cardiac Monitoring Data to Better Clinical Awareness and Care-Team Coordination. "
                "Proof of concept on SYNTHETIC data only — not a medical device.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def request_id(request: Request, call_next):
    rid = uuid.uuid4().hex[:12]
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Echo field locations and messages, never submitted values.
    errors = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Invalid request", "errors": errors})


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    rid = getattr(request.state, "request_id", "-")
    route = request.scope.get("route")
    log.error("unhandled error request_id=%s route=%s type=%s", rid, getattr(route, "path", "?"), type(exc).__name__)
    api_engineering.ERRORS.append({"at": datetime.now(timezone.utc), "request_id": rid,
                                   "route": getattr(route, "path", "?"), "type": type(exc).__name__})
    return JSONResponse(status_code=500, content={"detail": "Internal server error", "request_id": rid})


@app.get("/health", tags=["meta"])
def health():
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "unavailable"
    return {"status": "ok" if db == "ok" else "degraded", "database": db, "simulator_running": simulator.running}


app.include_router(api.router)
app.include_router(api_analytics.router)
app.include_router(api_knowledge.router)
app.include_router(api_engineering.router)
app.include_router(api_patient.router)
app.include_router(api_insight.router)
app.include_router(heartangel.router)
