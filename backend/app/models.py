"""Relational data model. All timestamps are stored timezone-aware (UTC)."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Patient(Base):
    __tablename__ = "patients"
    patient_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    synthetic_name: Mapped[str] = mapped_column(String(80))
    date_of_birth: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(1))
    admission_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Monitoring window end (discharge / monitoring stopped). NULL = still monitored.
    monitoring_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    care_unit: Mapped[str] = mapped_column(String(40), index=True)
    monitoring_status: Mapped[str] = mapped_column(String(20))  # active | discharged
    # Hospital-stay outcome: "Deceased" | "Discharged alive" | NULL while still admitted.
    discharge_outcome: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    assigned_care_team: Mapped[str] = mapped_column(String(40))
    device_id: Mapped[str] = mapped_column(String(20))
    device_type: Mapped[str] = mapped_column(String(30))

    diagnoses: Mapped[list["Diagnosis"]] = relationship(back_populates="patient")


class Diagnosis(Base):
    __tablename__ = "diagnoses"
    diagnosis_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    diagnosis_code: Mapped[str] = mapped_column(String(10))
    pathology_name: Mapped[str] = mapped_column(String(40))
    diagnosis_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active_status: Mapped[bool] = mapped_column(Boolean, default=True)

    patient: Mapped[Patient] = relationship(back_populates="diagnoses")


class Medication(Base):
    __tablename__ = "medications"
    medication_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    medication_name: Mapped[str] = mapped_column(String(40))
    medication_class: Mapped[str] = mapped_column(String(40))
    prescribed_dose: Mapped[str] = mapped_column(String(30))
    route: Mapped[str] = mapped_column(String(10))
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # active | stopped | completed


class Treatment(Base):
    __tablename__ = "treatments"
    treatment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    treatment_type: Mapped[str] = mapped_column(String(50))
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20))


class CardiacMeasurement(Base):
    __tablename__ = "cardiac_measurements"
    __table_args__ = (
        # Idempotency key: the same device reading the same parameter at the same instant is a duplicate.
        UniqueConstraint("device_id", "measurement_type", "observed_at", name="uq_measurement_event"),
        Index("ix_meas_patient_time", "patient_id", "observed_at"),
    )
    measurement_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"))
    device_id: Mapped[str] = mapped_column(String(20))
    measurement_type: Mapped[str] = mapped_column(String(20))  # heart_rate | systolic_bp | diastolic_bp | spo2
    numeric_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(10))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    quality_status: Mapped[str] = mapped_column(String(12))  # valid | missing | artifact | delayed


class Alarm(Base):
    __tablename__ = "alarms"
    __table_args__ = (Index("ix_alarm_patient_time", "patient_id", "triggered_at"),)
    alarm_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Upstream event id; unique so re-delivered alarm events are ignored.
    source_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"))
    measurement_id: Mapped[int | None] = mapped_column(
        ForeignKey("cardiac_measurements.measurement_id"), nullable=True
    )
    alarm_type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(12))  # critical | warning | advisory
    trigger_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    trigger_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(60), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    assigned_nurse: Mapped[str] = mapped_column(String(60))
    clinical_review_status: Mapped[str] = mapped_column(String(20))  # new | acknowledged | reviewed
    source: Mapped[str] = mapped_column(String(20))  # seed-history | simulator | ingest-api
    simulated_flag: Mapped[bool] = mapped_column(Boolean, default=True)


class ClinicalReview(Base):
    __tablename__ = "clinical_reviews"
    review_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    alarm_id: Mapped[int] = mapped_column(ForeignKey("alarms.alarm_id"), index=True)
    reviewer: Mapped[str] = mapped_column(String(60))
    review_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    disposition: Mapped[str] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    audit_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    username: Mapped[str] = mapped_column(String(60))
    role: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(40))
    resource_type: Mapped[str] = mapped_column(String(30))
    resource_id: Mapped[str] = mapped_column(String(40))
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
