"""enrich company_master; add screener freshness columns

Revision ID: c7a91e3d5f02
Revises: 15d9b474e4fe
Create Date: 2026-11-06 23:10:00

company_master gains the extra columns NSE's EQUITY_L.csv / SME_EQUITY_L.csv
already carry (ISIN, series, listing date, face value, SME flag) so search can
match on ISIN and rank main-board names above SME ones.

screener_metrics gains per-source freshness timestamps so the bulk pipeline can
refresh stalest-first instead of re-scraping the whole universe every run:
`quote_updated_at` (live price-derived fields) and `fundamentals_updated_at`
(Screener.in-derived fields).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7a91e3d5f02'
down_revision: Union[str, None] = '15d9b474e4fe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('company_master', sa.Column('isin', sa.String(length=16), nullable=True))
    op.add_column('company_master', sa.Column('series', sa.String(length=8), nullable=True))
    op.add_column('company_master', sa.Column('listing_date', sa.Date(), nullable=True))
    op.add_column('company_master', sa.Column('face_value', sa.Numeric(12, 4), nullable=True))
    op.add_column(
        'company_master',
        sa.Column('is_sme', sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index('ix_company_master_isin', 'company_master', ['isin'])

    op.add_column('screener_metrics', sa.Column('quote_updated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        'screener_metrics', sa.Column('fundamentals_updated_at', sa.DateTime(timezone=True), nullable=True)
    )
    # Rows scraped before this migration already hold Screener.in fundamentals.
    op.execute(
        "UPDATE screener_metrics SET fundamentals_updated_at = fetched_at "
        "WHERE roe IS NOT NULL OR roce IS NOT NULL OR debt_to_equity IS NOT NULL"
    )
    op.create_index(
        'ix_screener_metrics_fundamentals_updated_at', 'screener_metrics', ['fundamentals_updated_at']
    )


def downgrade() -> None:
    op.drop_index('ix_screener_metrics_fundamentals_updated_at', table_name='screener_metrics')
    op.drop_column('screener_metrics', 'fundamentals_updated_at')
    op.drop_column('screener_metrics', 'quote_updated_at')
    op.drop_index('ix_company_master_isin', table_name='company_master')
    op.drop_column('company_master', 'is_sme')
    op.drop_column('company_master', 'face_value')
    op.drop_column('company_master', 'listing_date')
    op.drop_column('company_master', 'series')
    op.drop_column('company_master', 'isin')
