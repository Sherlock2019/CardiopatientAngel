"""Asynchronous device simulator + in-process event bus for live alarm updates (SSE)."""
from __future__ import annotations

import asyncio
import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from . import analytics, integration
from . import domain as d
from .db import SessionLocal
from .ingest import create_alarm, ingest_measurement
from .models import Device, Patient


class EventBus:
    def __init__(self):
        self.subscribers: set[asyncio.Queue] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)

    def _put(self, payload: str):
        for q in list(self.subscribers):
            if not q.full():
                q.put_nowait(payload)

    def publish(self, event: str, data: dict):
        """Thread-safe publish (simulator ticks run in a worker thread)."""
        payload = json.dumps({"event": event, **data}, default=str)
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(self._put, payload)


bus = EventBus()

# value generator for abnormal readings: measurement -> list of (alarm_type, severity)
_ABNORMAL = {
    "heart_rate": [("HR high", "critical"), ("HR high", "warning"), ("HR high", "advisory"),
                   ("HR low", "critical"), ("HR low", "warning")],
    "spo2": [("SpO2 low", "critical"), ("SpO2 low", "warning"), ("SpO2 low", "advisory")],
    "systolic_bp": [("BP high", "warning"), ("BP low", "critical"), ("BP low", "warning"), ("BP high", "advisory")],
}
_CLAMP = {"HR high": (110, 175), "HR low": (32, 50), "SpO2 low": (75, 91.9), "BP high": (175, 220), "BP low": (65, 94)}


class Simulator:
    def __init__(self):
        self.running = False
        self.task: asyncio.Task | None = None
        self.interval_seconds = 3.0
        self.patients_per_tick = 8
        self.abnormal_probability = 0.04
        self.duplicate_probability = 0.05
        self.delayed_probability = 0.05
        self.missing_probability = 0.02
        self.reset_counters()
        self.rng = random.Random()
        self._baselines: dict[str, dict[str, float]] = {}

    def reset_counters(self):
        self.started_at: datetime | None = None
        self.ticks = 0
        self.measurements_ingested = 0
        self.duplicates_ignored = 0
        self.alarms_created = 0
        self.last_error: str | None = None

    def status(self) -> dict:
        return {
            "running": self.running,
            "started_at": self.started_at,
            "interval_seconds": self.interval_seconds,
            "patients_per_tick": self.patients_per_tick,
            "abnormal_probability": self.abnormal_probability,
            "duplicate_probability": self.duplicate_probability,
            "delayed_probability": self.delayed_probability,
            "missing_probability": self.missing_probability,
            "ticks": self.ticks,
            "measurements_ingested": self.measurements_ingested,
            "duplicates_ignored": self.duplicates_ignored,
            "alarms_created": self.alarms_created,
            "last_error": self.last_error,
        }

    def configure(self, **kw):
        for k, v in kw.items():
            if v is not None and hasattr(self, k):
                setattr(self, k, v)

    async def start(self):
        if self.running:
            return
        self.running = True
        self.started_at = datetime.now(timezone.utc)
        self.task = asyncio.create_task(self._run())

    async def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None

    async def _run(self):
        while self.running:
            try:
                await asyncio.to_thread(self.tick)
            except Exception as exc:  # keep simulator alive; never log patient data
                self.last_error = type(exc).__name__
            await asyncio.sleep(self.interval_seconds)

    def _load_baselines(self, db, patient_ids: list[str]):
        missing = [p for p in patient_ids if p not in self._baselines]
        if not missing:
            return
        rows = db.execute(text(
            "SELECT patient_id, measurement_type, percentile_cont(0.5) WITHIN GROUP (ORDER BY numeric_value) "
            "FROM cardiac_measurements WHERE patient_id = ANY(:ids) AND quality_status IN ('valid','delayed') "
            "GROUP BY patient_id, measurement_type"), {"ids": missing}).all()
        for pid in missing:
            self._baselines[pid] = dict(heart_rate=78, systolic_bp=128, diastolic_bp=76, spo2=96.5)
        for pid, mtype, med in rows:
            if med is not None:
                self._baselines[pid][mtype] = float(med)

    def tick(self):
        r = self.rng
        with SessionLocal() as db:
            active = db.execute(select(Patient).where(Patient.monitoring_status == "active")).scalars().all()
            if not active:
                return
            chosen = r.sample(active, min(self.patients_per_tick, len(active)))
            self._load_baselines(db, [p.patient_id for p in chosen])
            now = datetime.now(timezone.utc).replace(microsecond=0)
            new_alarms = []
            devices = {dv.device_id: dv for dv in db.execute(
                select(Device).where(Device.device_id.in_([p.device_id for p in chosen]))).scalars()}
            for p in chosen:
                base = self._baselines[p.patient_id]
                info = d.DEVICE_INFO.get(p.device_type, d.DEVICE_INFO["Bedside monitor"])
                observed = now - timedelta(seconds=r.randint(0, 2))
                received = observed + timedelta(seconds=r.randint(1, 4))
                if r.random() < self.delayed_probability:
                    observed = observed - timedelta(minutes=r.uniform(6, 30))
                signal_lost = r.random() < self.missing_probability
                dev = devices.get(p.device_id)
                if dev:
                    dev.last_sync_at = received
                    if dev.battery_pct is not None:  # drain, low-battery alert at the 15% crossing, recharge when flat
                        before = dev.battery_pct
                        dev.battery_pct = 100 if before <= 3 else max(0, before - r.randint(0, 3))
                        if before > 15 >= dev.battery_pct:
                            aid = create_alarm(db, p, "Low battery", "advisory", observed, "simulator", f"sim-{uuid.uuid4().hex}")
                            if aid:
                                new_alarms.append((aid, p, ("Low battery", "advisory"), None))
                if "Fall detected" in info["alarms"] and r.random() < self.abnormal_probability / 4:
                    sev = "critical" if r.random() < 0.4 else "warning"
                    aid = create_alarm(db, p, "Fall detected", sev, observed, "simulator", f"sim-{uuid.uuid4().hex}")
                    if aid:
                        new_alarms.append((aid, p, ("Fall detected", sev), None))
                for mtype in [s for s in info["signals"] if s != "sleep_hours"]:
                    sd = {"heart_rate": 5, "systolic_bp": 8, "diastolic_bp": 5, "spo2": 0.8}[mtype]
                    value: float | None = r.gauss(base[mtype], sd)
                    if mtype == "spo2":
                        value = min(value, 100)
                    if mtype in _ABNORMAL and r.random() < self.abnormal_probability:
                        atype, sev = r.choice(_ABNORMAL[mtype])
                        lo, hi = d.THRESHOLD_BANDS[atype][sev]
                        clo, chi = _CLAMP[atype]
                        value = r.uniform(max(lo, clo), min(hi, chi))
                    if signal_lost:
                        value = None
                    mid, created = ingest_measurement(db, p, mtype, value, observed, received)
                    if r.random() < self.duplicate_probability:
                        _, dup_created = ingest_measurement(db, p, mtype, value, observed, received)
                        self.duplicates_ignored += 0 if dup_created else 1
                    if not created:
                        self.duplicates_ignored += 1
                        continue
                    self.measurements_ingested += 1
                    rule = d.evaluate_threshold(mtype, value)
                    if rule and rule[0] in info["alarms"]:
                        aid = create_alarm(db, p, rule[0], rule[1], observed, "simulator",
                                           f"sim-{uuid.uuid4().hex}", mid, None if value is None else round(value, 0))
                        if aid:
                            new_alarms.append((aid, p, rule, value))
                if signal_lost:
                    aid = create_alarm(db, p, "Signal loss", "advisory", observed, "simulator", f"sim-{uuid.uuid4().hex}")
                    if aid:
                        new_alarms.append((aid, p, ("Signal loss", "advisory"), None))
            for aid, p, (atype, sev), _ in new_alarms:
                if sev == "critical":  # downstream systems (virtual-care platform) subscribe to critical alarms
                    integration.emit(db, "alarm.created", {"alarm_id": aid, "patient_id": p.patient_id,
                                                           "alarm_type": atype, "severity": sev, "care_unit": p.care_unit})
            db.commit()
            self.ticks += 1
        if new_alarms:
            self.alarms_created += len(new_alarms)
            analytics.invalidate()
            for aid, p, (atype, sev), value in new_alarms:
                bus.publish("alarm", {"alarm_id": aid, "patient_id": p.patient_id, "care_unit": p.care_unit,
                                      "alarm_type": atype, "severity": sev})
        else:
            analytics.invalidate()


simulator = Simulator()


def _heartbeat():
    """Demo stand-in for device keep-alive pings: in-use devices keep syncing, except the deliberate offline set."""
    with SessionLocal() as db:
        ids = [i for i in db.execute(select(Device.device_id).where(Device.status == "in_use")).scalars()
               if not d.demo_offline(i)]
        db.execute(text("UPDATE devices SET last_sync_at = now() - random() * interval '3 minutes' "
                        "WHERE device_id = ANY(:ids) AND last_sync_at < now() - interval '1 minute'"), {"ids": ids})
        db.commit()


async def heartbeat_loop(interval: float = 30.0):
    while True:
        try:
            await asyncio.to_thread(_heartbeat)
        except Exception:
            pass
        await asyncio.sleep(interval)
