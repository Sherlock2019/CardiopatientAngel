from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from . import domain as d


class LoginIn(BaseModel):
    username: str = Field(max_length=40)


class AckIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ResolveIn(BaseModel):
    disposition: str
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("disposition")
    @classmethod
    def known(cls, v):
        if v not in d.DISPOSITIONS:
            raise ValueError(f"disposition must be one of {d.DISPOSITIONS}")
        return v


class SimulatorConfig(BaseModel):
    interval_seconds: float | None = Field(default=None, ge=0.5, le=60)
    patients_per_tick: int | None = Field(default=None, ge=1, le=50)
    abnormal_probability: float | None = Field(default=None, ge=0, le=0.5)
    duplicate_probability: float | None = Field(default=None, ge=0, le=0.5)
    delayed_probability: float | None = Field(default=None, ge=0, le=0.5)
    missing_probability: float | None = Field(default=None, ge=0, le=0.5)


class MeasurementIn(BaseModel):
    patient_id: str = Field(pattern=r"^P\d{5}$")
    measurement_type: Literal["heart_rate", "systolic_bp", "diastolic_bp", "spo2"]
    value: float | None = Field(default=None, ge=0, le=400)
    observed_at: datetime
    received_at: datetime | None = None

    @field_validator("observed_at", "received_at")
    @classmethod
    def tz_aware(cls, v):
        if v is not None and v.tzinfo is None:
            raise ValueError("timestamps must include a timezone offset")
        return v


class AttentionWeights(BaseModel):
    severity_points: dict[Literal["critical", "warning", "advisory"], int] | None = None
    recent_window_hours: int | None = Field(default=None, ge=1, le=48)
    points_per_recent_alarm: int | None = Field(default=None, ge=0, le=50)
    recent_cap: int | None = Field(default=None, ge=0, le=100)
    points_per_minute_unacknowledged: float | None = Field(default=None, ge=0, le=10)
    unacknowledged_cap: int | None = Field(default=None, ge=0, le=100)
    points_per_repeat: int | None = Field(default=None, ge=0, le=50)
    repeat_cap: int | None = Field(default=None, ge=0, le=100)


class SettingsPatch(BaseModel):
    display_timezone: str | None = None
    repeat_window_minutes: int | None = Field(default=None, ge=5, le=1440)
    small_cohort_patients: int | None = Field(default=None, ge=1, le=500)
    suppress_cohort_patients: int | None = Field(default=None, ge=0, le=500)
    attention: AttentionWeights | None = None
