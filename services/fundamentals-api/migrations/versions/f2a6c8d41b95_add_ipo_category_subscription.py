"""add category-wise subscription columns to ipos

Revision ID: f2a6c8d41b95
Revises: e5b1c9a07d33
Create Date: 2026-11-21 20:30:00

#285: the latest bidding day's subscription multiple for QIB, NII, small NII, big NII and retail, from the aggregator's per-IPO
subscription page, plus when it was read. Six nullable columns on `ipos`; existing rows are untouched (null = unknown) and the next
`refresh-ipos` run fills the open and closed ones. Additive, so the app version already in production keeps working.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'f2a6c8d41b95'
down_revision: Union[str, None] = 'e5b1c9a07d33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MULTIPLES = ('sub_qib', 'sub_nii', 'sub_snii', 'sub_bnii', 'sub_retail')


def upgrade() -> None:
    for name in _MULTIPLES:
        op.add_column('ipos', sa.Column(name, sa.Numeric(12, 2), nullable=True))
    op.add_column('ipos', sa.Column('sub_as_of', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('ipos', 'sub_as_of')
    for name in reversed(_MULTIPLES):
        op.drop_column('ipos', name)
