"""Relational data model. All timestamps are stored timezone-aware (UTC)."""
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Computed,
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
from sqlalchemy.dialects.postgresql import TSVECTOR
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
    # Synthetic family / emergency contact (fictional 555-01xx numbers)
    family_contact_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    family_contact_relation: Mapped[str | None] = mapped_column(String(30), nullable=True)
    family_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
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
    # Tamper evidence: sha256(prev_hash + canonical row). Any edit or deletion breaks the chain.
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    row_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Device(Base):
    """Monitoring device fleet (one primary device per patient in the demo)."""
    __tablename__ = "devices"
    device_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    device_type: Mapped[str] = mapped_column(String(30), index=True)
    model: Mapped[str] = mapped_column(String(30))
    firmware_version: Mapped[str] = mapped_column(String(20))
    connectivity: Mapped[str] = mapped_column(String(30))
    battery_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)  # NULL = mains powered
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # in_use | returned
    patient_id: Mapped[str | None] = mapped_column(ForeignKey("patients.patient_id"), nullable=True, index=True)


class CheckIn(Base):
    """Daily check-in submitted by a patient from the mobile app."""
    __tablename__ = "checkins"
    checkin_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.patient_id"), index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    feeling: Mapped[int] = mapped_column(Integer)  # 1 (poor) .. 5 (great)
    symptoms: Mapped[str] = mapped_column(Text, default="")  # comma-separated from a fixed list
    took_medications: Mapped[bool] = mapped_column(Boolean)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="mobile")


class KnowledgeRecord(Base):
    """Engineering knowledge (ADRs, patterns, runbooks, postmortems...). No patient data, ever."""
    __tablename__ = "knowledge_records"
    knowledge_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(60), index=True)
    summary: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(30))
    source_reference: Mapped[str | None] = mapped_column(String(300), nullable=True)
    related_project: Mapped[str] = mapped_column(String(60), default="CardioWatch AI")
    related_feature: Mapped[str | None] = mapped_column(String(60), nullable=True)
    owner: Mapped[str] = mapped_column(String(60))
    reviewer: Mapped[str | None] = mapped_column(String(60), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), index=True)  # draft | in_review | approved | rejected | deprecated
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    review_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    access_classification: Mapped[str] = mapped_column(String(20))  # public | internal | restricted
    tags: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    superseded_by: Mapped[str | None] = mapped_column(String(24), nullable=True)
    redaction_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_tsv: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', coalesce(knowledge_id,'') || ' ' || coalesce(title,'') || ' ' || "
                           "coalesce(summary,'') || ' ' || coalesce(content,'') || ' ' || coalesce(tags,''))", persisted=True))
    __table_args__ = (Index("ix_knowledge_tsv", "search_tsv", postgresql_using="gin"),)


class KnowledgeRevision(Base):
    """Append-only history: every create, edit, submission, review and deprecation is a new row."""
    __tablename__ = "knowledge_revisions"
    revision_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    knowledge_id: Mapped[str] = mapped_column(ForeignKey("knowledge_records.knowledge_id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    changed_by: Mapped[str] = mapped_column(String(60))
    change_type: Mapped[str] = mapped_column(String(30))
    status_after: Mapped[str] = mapped_column(String(20))
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_sha256: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[str] = mapped_column(Text)  # JSON of the record at this point


class KnowledgeFeedback(Base):
    __tablename__ = "knowledge_feedback"
    feedback_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    knowledge_id: Mapped[str] = mapped_column(ForeignKey("knowledge_records.knowledge_id"), index=True)
    username: Mapped[str] = mapped_column(String(60))
    useful: Mapped[bool] = mapped_column(Boolean)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class KnowledgeUse(Base):
    """Retrieval and reuse events (a record surfaced by search, or cited in a feature)."""
    __tablename__ = "knowledge_uses"
    use_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    knowledge_id: Mapped[str] = mapped_column(ForeignKey("knowledge_records.knowledge_id"), index=True)
    username: Mapped[str] = mapped_column(String(60))
    event_type: Mapped[str] = mapped_column(String(20))  # retrieved | reused
    feature: Mapped[str | None] = mapped_column(String(60), nullable=True)
    query: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class InsightRecommendation(Base):
    """Operational recommendation from CardioInsight. Advisory until a human approves; outcome checked later."""
    __tablename__ = "insight_recommendations"
    rec_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    requested_by: Mapped[str] = mapped_column(String(60))
    question: Mapped[str] = mapped_column(Text)
    specialist: Mapped[str] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(Text)
    rationale: Mapped[str] = mapped_column(Text)
    metric: Mapped[str] = mapped_column(String(60))          # the number the outcome check re-measures
    target: Mapped[str] = mapped_column(String(60))          # which unit / device type / shift it applies to
    baseline: Mapped[float] = mapped_column(Float)
    better: Mapped[str] = mapped_column(String(8))           # "lower" | "higher"
    evidence: Mapped[str] = mapped_column(Text)              # JSON of the deterministic tool output (calc)
    status: Mapped[str] = mapped_column(String(12), index=True)  # proposed | approved | rejected
    decided_by: Mapped[str | None] = mapped_column(String(60), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: current value, delta, improved
    outcome_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IntegrationEvent(Base):
    """Transactional outbox: events for external systems (telemedicine platform, EHR), delivered by a relay."""
    __tablename__ = "integration_events"
    event_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(40), index=True)  # alarm.created | alarm.acknowledged | consult.requested
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    target: Mapped[str] = mapped_column(String(40))
    payload: Mapped[str] = mapped_column(Text)  # JSON, identifiers only (no free-text clinical notes)
    status: Mapped[str] = mapped_column(String(12))  # pending | delivered
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
