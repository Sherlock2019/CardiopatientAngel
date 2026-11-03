"""patient family contact

Revision ID: b7c1e9a40f21
Revises: de06e43853b9
Create Date: 2026-11-03 23:40:00
"""
from alembic import op
import sqlalchemy as sa

from app.domain import family_contact

revision = 'b7c1e9a40f21'
down_revision = 'de06e43853b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patients', sa.Column('family_contact_name', sa.String(length=80), nullable=True))
    op.add_column('patients', sa.Column('family_contact_relation', sa.String(length=30), nullable=True))
    op.add_column('patients', sa.Column('family_contact_phone', sa.String(length=30), nullable=True))
    # backfill existing synthetic patients (same deterministic values the seed produces)
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT patient_id, synthetic_name FROM patients")).all()
    for pid, name in rows:
        n, rel, phone = family_contact(pid, name)
        conn.execute(sa.text("UPDATE patients SET family_contact_name=:n, family_contact_relation=:r, family_contact_phone=:p "
                             "WHERE patient_id=:id"), {"n": n, "r": rel, "p": phone, "id": pid})


def downgrade() -> None:
    op.drop_column('patients', 'family_contact_phone')
    op.drop_column('patients', 'family_contact_relation')
    op.drop_column('patients', 'family_contact_name')
