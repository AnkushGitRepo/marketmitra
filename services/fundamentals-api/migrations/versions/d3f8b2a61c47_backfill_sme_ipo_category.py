"""backfill IPO category for SME issues that were stored as mainboard

Revision ID: d3f8b2a61c47
Revises: c7a91e3d5f02
Create Date: 2026-11-10 12:00:00

The IPO scraper classified every issue as `mainboard`: it looked for a badge
reading exactly "SME", but the aggregator badges SME issues "BSE SME" /
"NSE SME". The scraper is fixed, and the next ingest corrects every IPO still
listed on the source page (the upsert rewrites `category`). Issues that have
since dropped off that page are never re-scraped, so correct them here.

Rule: the minimum retail application (price x lot size). A mainboard retail
application is capped near Rs 15,000, while SME applications start around
Rs 1 lakh. In the production data (72 issues) the values split cleanly into
32 at or below Rs 16,000 and 37 at or above Rs 100,000, nothing in between, so
Rs 50,000 separates them with a wide margin on both sides. Rows without a
price or lot size are left untouched.

Data-only and one-way: a downgrade cannot tell which rows were mislabelled,
so it is a no-op.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd3f8b2a61c47'
down_revision: Union[str, None] = 'c7a91e3d5f02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Rupees. Between the mainboard cap (~15,000) and the SME floor (~100,000).
SME_MIN_APPLICATION_INR = 50_000


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE ipos
           SET category = 'sme'
         WHERE category = 'mainboard'
           AND price IS NOT NULL
           AND lot_size IS NOT NULL
           AND price * lot_size >= {SME_MIN_APPLICATION_INR}
        """
    )


def downgrade() -> None:
    # Cannot be reversed: the original (wrong) labels are indistinguishable
    # from correct mainboard ones.
    pass
