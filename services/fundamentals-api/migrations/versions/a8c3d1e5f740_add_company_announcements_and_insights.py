"""add company announcements and insights

Revision ID: a8c3d1e5f740
Revises: f2a6c8d41b95
Create Date: 2026-11-25 16:30:00

#365: two new tables for data the research report was missing. `company_announcements` holds a company's recent
stock-exchange announcements and credit-rating links (Screener's Documents section), each with a rule-based category;
`company_insights` holds Screener's machine-generated pros and cons. Both are new tables, so the app version already
in production keeps working (nothing reads them until the matching routes are deployed). The `ratios` statement
type (working-capital days and similar) needs no schema change: `financial_line_items.statement_type` is a plain string.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'a8c3d1e5f740'
down_revision: Union[str, None] = 'f2a6c8d41b95'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'company_announcements',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('announced_on', sa.Date(), nullable=True),
        sa.Column('title', sa.String(512), nullable=False),
        sa.Column('summary', sa.String(1000), nullable=True),
        sa.Column('category', sa.String(32), nullable=False),
        sa.Column('url', sa.String(1024), nullable=False),
        sa.Column('source_tier', sa.String(32), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('company_id', 'url', 'title', name='uq_company_announcement'),
    )
    op.create_index(
        'ix_company_announcements_company_date', 'company_announcements', ['company_id', 'announced_on']
    )
    op.create_table(
        'company_insights',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(8), nullable=False),
        sa.Column('text', sa.String(1000), nullable=False),
        sa.Column('source_tier', sa.String(32), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('company_id', 'kind', 'text', name='uq_company_insight'),
    )


def downgrade() -> None:
    op.drop_table('company_insights')
    op.drop_index('ix_company_announcements_company_date', table_name='company_announcements')
    op.drop_table('company_announcements')
