"""add mutual fund tables

Revision ID: e5b1c9a07d33
Revises: d3f8b2a61c47
Create Date: 2026-11-18 10:00:00

Scheme master, daily NAV, computed metrics and disclosed factsheet data for
the mutual fund vertical (ADR 0067).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'e5b1c9a07d33'
down_revision: Union[str, None] = 'd3f8b2a61c47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mf_schemes',
        sa.Column('scheme_code', sa.Integer(), autoincrement=False, nullable=False),
        sa.Column('name', sa.String(300), nullable=False),
        sa.Column('base_name', sa.String(300), nullable=False),
        sa.Column('fund_house', sa.String(160), nullable=False),
        sa.Column('scheme_type', sa.String(16), nullable=False),
        sa.Column('category', sa.String(32), nullable=False),
        sa.Column('sub_category', sa.String(96), nullable=True),
        sa.Column('plan', sa.String(8), nullable=False),
        sa.Column('option', sa.String(8), nullable=False),
        sa.Column('isin_growth', sa.String(12), nullable=True),
        sa.Column('isin_reinvest', sa.String(12), nullable=True),
        sa.Column('latest_nav', sa.Numeric(18, 6), nullable=True),
        sa.Column('latest_nav_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('history_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('scheme_code'),
    )
    for col in ('base_name', 'fund_house', 'category', 'sub_category', 'isin_growth'):
        op.create_index(f'ix_mf_schemes_{col}', 'mf_schemes', [col])

    op.create_table(
        'mf_nav',
        sa.Column('scheme_code', sa.Integer(), nullable=False),
        sa.Column('nav_date', sa.Date(), nullable=False),
        sa.Column('nav', sa.Numeric(18, 6), nullable=False),
        sa.ForeignKeyConstraint(['scheme_code'], ['mf_schemes.scheme_code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('scheme_code', 'nav_date'),
    )

    metric_cols = [
        'ret_1m', 'ret_3m', 'ret_6m', 'ret_1y', 'ret_3y', 'ret_5y', 'ret_10y',
        'std_dev_3y', 'sharpe_3y', 'sortino_3y', 'max_drawdown_3y', 'sip_xirr_3y', 'sip_xirr_5y',
    ]
    op.create_table(
        'mf_metrics',
        sa.Column('scheme_code', sa.Integer(), nullable=False),
        sa.Column('as_of', sa.Date(), nullable=False),
        *[sa.Column(c, sa.Numeric(10, 4), nullable=True) for c in metric_cols],
        sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['scheme_code'], ['mf_schemes.scheme_code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('scheme_code'),
    )
    for col in ('ret_1y', 'ret_3y', 'ret_5y'):
        op.create_index(f'ix_mf_metrics_{col}', 'mf_metrics', [col])

    op.create_table(
        'mf_factsheet',
        sa.Column('scheme_code', sa.Integer(), nullable=False),
        sa.Column('expense_ratio', sa.Numeric(6, 3), nullable=True),
        sa.Column('aum_cr', sa.Numeric(16, 2), nullable=True),
        sa.Column('exit_load', sa.String(300), nullable=True),
        sa.Column('fund_manager', sa.String(300), nullable=True),
        sa.Column('benchmark', sa.String(200), nullable=True),
        sa.Column('launch_date', sa.Date(), nullable=True),
        sa.Column('as_of', sa.Date(), nullable=True),
        sa.Column('source', sa.String(64), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['scheme_code'], ['mf_schemes.scheme_code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('scheme_code'),
    )


def downgrade() -> None:
    op.drop_table('mf_factsheet')
    for col in ('ret_5y', 'ret_3y', 'ret_1y'):
        op.drop_index(f'ix_mf_metrics_{col}', table_name='mf_metrics')
    op.drop_table('mf_metrics')
    op.drop_table('mf_nav')
    for col in ('isin_growth', 'sub_category', 'category', 'fund_house', 'base_name'):
        op.drop_index(f'ix_mf_schemes_{col}', table_name='mf_schemes')
    op.drop_table('mf_schemes')
