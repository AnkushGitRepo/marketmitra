"""add screener metrics table

Revision ID: 15d9b474e4fe
Revises: 2796fbd6805c
Create Date: 2026-09-13 00:43:40.815548

Screener feature (ADR 0025). One row per NSE-listed company, refreshed
wholesale by the new bulk-ingestion job — distinct from the existing
per-company-lazy ratios/peer_comparisons tables, which are untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '15d9b474e4fe'
down_revision: Union[str, None] = '2796fbd6805c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'screener_metrics',
        sa.Column('symbol', sa.String(length=32), nullable=False),
        sa.Column('name', sa.String(length=256), nullable=False),
        sa.Column('sector', sa.String(length=128), nullable=True),
        sa.Column('industry', sa.String(length=128), nullable=True),
        sa.Column('market_cap', sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column('current_price', sa.Numeric(precision=16, scale=4), nullable=True),
        sa.Column('pe', sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column('book_value', sa.Numeric(precision=16, scale=4), nullable=True),
        sa.Column('pb', sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column('dividend_yield', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('roce', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('roe', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('face_value', sa.Numeric(precision=12, scale=4), nullable=True),
        sa.Column('debt_to_equity', sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column('sales_growth_3y_cagr', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('profit_growth_3y_cagr', sa.Numeric(precision=8, scale=4), nullable=True),
        sa.Column('fetch_status', sa.String(length=16), nullable=False, server_default='ok'),
        sa.Column('source_tier', sa.String(length=32), nullable=False, server_default='tier3_screener_bulk'),
        sa.Column('fetched_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('symbol'),
    )
    op.create_index('ix_screener_metrics_sector', 'screener_metrics', ['sector'])
    op.create_index('ix_screener_metrics_industry', 'screener_metrics', ['industry'])
    op.create_index('ix_screener_metrics_market_cap', 'screener_metrics', ['market_cap'])
    op.create_index('ix_screener_metrics_pe', 'screener_metrics', ['pe'])
    op.create_index('ix_screener_metrics_pb', 'screener_metrics', ['pb'])
    op.create_index('ix_screener_metrics_dividend_yield', 'screener_metrics', ['dividend_yield'])
    op.create_index('ix_screener_metrics_roce', 'screener_metrics', ['roce'])
    op.create_index('ix_screener_metrics_roe', 'screener_metrics', ['roe'])
    op.create_index('ix_screener_metrics_debt_to_equity', 'screener_metrics', ['debt_to_equity'])
    op.create_index('ix_screener_metrics_sales_growth_3y_cagr', 'screener_metrics', ['sales_growth_3y_cagr'])
    op.create_index('ix_screener_metrics_profit_growth_3y_cagr', 'screener_metrics', ['profit_growth_3y_cagr'])


def downgrade() -> None:
    op.drop_index('ix_screener_metrics_profit_growth_3y_cagr', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_sales_growth_3y_cagr', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_debt_to_equity', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_roe', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_roce', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_dividend_yield', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_pb', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_pe', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_market_cap', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_industry', table_name='screener_metrics')
    op.drop_index('ix_screener_metrics_sector', table_name='screener_metrics')
    op.drop_table('screener_metrics')
