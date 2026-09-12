"""SQLAlchemy ORM models — the Postgres-backed storage mirror of app.schemas.

One table per pydantic model in app/schemas.py, plus a `source_tier` column
on every table whose data can come from more than one tier, so a stored
record always shows which tier produced it.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CompanyMasterORM(Base):
    """The full NSE-listed-equity symbol/name list, for search (see
    app/ingestion/company_master.py) — distinct from CompanyORM, which
    only gets a row once something actually queries that company's data."""

    __tablename__ = "company_master"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CompanyORM(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    nse_symbol: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    bse_code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    isin: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(256))
    industry: Mapped[str | None] = mapped_column(String(128))
    sector: Mapped[str | None] = mapped_column(String(128))
    about: Mapped[str | None] = mapped_column(String(2000))
    source_tier: Mapped[str | None] = mapped_column(String(32))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    financial_line_items: Mapped[list[FinancialLineItemORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    ratios: Mapped[list[RatioORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    shareholding_entries: Mapped[list[ShareholdingEntryORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    peer_comparisons: Mapped[list[PeerComparisonORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    price_history: Mapped[list[PriceHistoryPointORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    documents: Mapped[list[DocumentReferenceORM]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class FinancialLineItemORM(Base):
    __tablename__ = "financial_line_items"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "statement_type", "period_type", "period_end", "label",
            name="uq_financial_line_item",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    statement_type: Mapped[str] = mapped_column(String(32))
    period_type: Mapped[str] = mapped_column(String(16))
    period_end: Mapped[date] = mapped_column(Date)
    label: Mapped[str] = mapped_column(String(128))
    value: Mapped[float | None] = mapped_column(Numeric(20, 4))
    unit: Mapped[str] = mapped_column(String(16), default="INR_CR")
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="financial_line_items")


class RatioORM(Base):
    __tablename__ = "ratios"
    __table_args__ = (
        UniqueConstraint("company_id", "name", "as_of", name="uq_ratio"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(64))
    value: Mapped[float | None] = mapped_column(Numeric(20, 4))
    unit: Mapped[str | None] = mapped_column(String(16))
    as_of: Mapped[date] = mapped_column(Date)
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="ratios")


class PeerComparisonORM(Base):
    """One peer's row in a company's peer-comparison table (Screener's
    #peers section), including the company itself as one row."""

    __tablename__ = "peer_comparisons"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "peer_symbol", "as_of", name="uq_peer_comparison"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    peer_symbol: Mapped[str] = mapped_column(String(32))
    peer_name: Mapped[str] = mapped_column(String(256))
    is_target: Mapped[bool] = mapped_column(default=False)
    cmp: Mapped[float | None] = mapped_column(Numeric(16, 4))
    pe: Mapped[float | None] = mapped_column(Numeric(12, 4))
    market_cap: Mapped[float | None] = mapped_column(Numeric(20, 4))
    div_yield: Mapped[float | None] = mapped_column(Numeric(8, 4))
    net_profit_qtr: Mapped[float | None] = mapped_column(Numeric(16, 4))
    qtr_profit_var_pct: Mapped[float | None] = mapped_column(Numeric(10, 4))
    sales_qtr: Mapped[float | None] = mapped_column(Numeric(16, 4))
    qtr_sales_var_pct: Mapped[float | None] = mapped_column(Numeric(10, 4))
    roce_pct: Mapped[float | None] = mapped_column(Numeric(8, 4))
    as_of: Mapped[date] = mapped_column(Date)
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="peer_comparisons")


class ShareholdingEntryORM(Base):
    __tablename__ = "shareholding_entries"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "category", "quarter_end", name="uq_shareholding_entry"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(64))
    percentage: Mapped[float] = mapped_column(Numeric(6, 3))
    quarter_end: Mapped[date] = mapped_column(Date)
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="shareholding_entries")


class PriceHistoryPointORM(Base):
    __tablename__ = "price_history"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "exchange", "trade_date", name="uq_price_history_point"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    exchange: Mapped[str] = mapped_column(String(8))
    trade_date: Mapped[date] = mapped_column(Date)
    open: Mapped[float | None] = mapped_column(Numeric(16, 4))
    high: Mapped[float | None] = mapped_column(Numeric(16, 4))
    low: Mapped[float | None] = mapped_column(Numeric(16, 4))
    close: Mapped[float | None] = mapped_column(Numeric(16, 4))
    volume: Mapped[int | None]
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="price_history")


class IpoORM(Base):
    """An IPO's calendar + subscription + grey-market premium (ADR 0017).
    Deduped on `slug`. GMP fields are an unofficial grey-market estimate,
    labelled as such everywhere they surface."""

    __tablename__ = "ipos"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(256))
    source_url: Mapped[str | None] = mapped_column(String(512))
    category: Mapped[str] = mapped_column(String(16))  # mainboard | sme
    status: Mapped[str] = mapped_column(String(16), index=True)  # upcoming | open | closed | listed

    price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    ipo_size_cr: Mapped[float | None] = mapped_column(Numeric(14, 2))
    lot_size: Mapped[int | None]
    rating: Mapped[int | None]  # 0-5 "fire" rating from the aggregator
    subscription_times: Mapped[float | None] = mapped_column(Numeric(12, 2))
    anchor: Mapped[bool | None]

    gmp: Mapped[float | None] = mapped_column(Numeric(12, 2))
    gmp_pct: Mapped[float | None] = mapped_column(Numeric(8, 2))
    gmp_low: Mapped[float | None] = mapped_column(Numeric(12, 2))
    gmp_high: Mapped[float | None] = mapped_column(Numeric(12, 2))
    gmp_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    open_date: Mapped[date | None] = mapped_column(Date)
    close_date: Mapped[date | None] = mapped_column(Date)
    allotment_date: Mapped[date | None] = mapped_column(Date)
    listing_date: Mapped[date | None] = mapped_column(Date)

    source_tier: Mapped[str] = mapped_column(String(32), default="tier3_ipo_aggregator")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NewsItemORM(Base):
    """A single news headline (ADR 0015). URL is the dedup key. Sentiment is
    a VADER headline-tone label, not an analyst/market signal."""

    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(1024), unique=True)
    title: Mapped[str] = mapped_column(String(512))
    summary: Mapped[str | None] = mapped_column(String(2000))
    source: Mapped[str] = mapped_column(String(128))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    sentiment: Mapped[str] = mapped_column(String(16))  # positive | neutral | negative
    sentiment_score: Mapped[float] = mapped_column(Numeric(6, 4))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    symbols: Mapped[list[NewsItemSymbolORM]] = relationship(
        back_populates="news_item", cascade="all, delete-orphan"
    )


class NewsItemSymbolORM(Base):
    """Many-to-many tag: which NSE symbol(s) a news item is about. Empty for
    a broad-feed item that matched no company."""

    __tablename__ = "news_item_symbols"
    __table_args__ = (
        UniqueConstraint("news_item_id", "symbol", name="uq_news_item_symbol"),
        Index("ix_news_item_symbols_symbol", "symbol"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    news_item_id: Mapped[int] = mapped_column(
        ForeignKey("news_items.id", ondelete="CASCADE")
    )
    symbol: Mapped[str] = mapped_column(String(32))

    news_item: Mapped[NewsItemORM] = relationship(back_populates="symbols")


class DocumentReferenceORM(Base):
    __tablename__ = "document_references"
    __table_args__ = (
        UniqueConstraint("company_id", "url", name="uq_document_reference_url"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"))
    document_type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(512))
    url: Mapped[str] = mapped_column(String(1024))
    period_end: Mapped[date | None] = mapped_column(Date)
    source_tier: Mapped[str] = mapped_column(String(32))
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    company: Mapped[CompanyORM] = relationship(back_populates="documents")


class ScreenerMetricsORM(Base):
    """One row per NSE-listed company, refreshed wholesale by the bulk
    screener-universe job (scripts/refresh_screener_universe.py, via
    POST /screener/ingest) — see ADR 0025. Deliberately NOT the same shape
    as RatioORM (EAV: one row per named ratio per company per date, right
    for "whatever Screener's per-company widget happened to show," wrong
    for "filter/sort across the whole universe"). This table exists
    specifically to be filtered and indexed across ~2,570 companies at
    once; RatioORM/PeerComparisonORM are untouched and keep serving the
    per-company lazy stock-detail-page path exactly as before.

    Keyed by `symbol` like CompanyMasterORM (a standalone reference table,
    not a child of `companies` via FK) since this table is refreshed
    independently of the lazy `companies`/`ratios` population path."""

    __tablename__ = "screener_metrics"

    symbol: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    sector: Mapped[str | None] = mapped_column(String(128), index=True)
    industry: Mapped[str | None] = mapped_column(String(128), index=True)

    market_cap: Mapped[float | None] = mapped_column(Numeric(20, 4), index=True)
    current_price: Mapped[float | None] = mapped_column(Numeric(16, 4))
    pe: Mapped[float | None] = mapped_column(Numeric(12, 4), index=True)
    book_value: Mapped[float | None] = mapped_column(Numeric(16, 4))
    pb: Mapped[float | None] = mapped_column(Numeric(12, 4), index=True)
    dividend_yield: Mapped[float | None] = mapped_column(Numeric(8, 4), index=True)
    roce: Mapped[float | None] = mapped_column(Numeric(8, 4), index=True)
    roe: Mapped[float | None] = mapped_column(Numeric(8, 4), index=True)
    face_value: Mapped[float | None] = mapped_column(Numeric(12, 4))
    debt_to_equity: Mapped[float | None] = mapped_column(Numeric(10, 4), index=True)
    sales_growth_3y_cagr: Mapped[float | None] = mapped_column(Numeric(8, 4), index=True)
    profit_growth_3y_cagr: Mapped[float | None] = mapped_column(Numeric(8, 4), index=True)

    # ok = fully parsed; partial = page fetched but a section (e.g. balance
    # sheet) didn't parse, so some derived fields are null; failed = the
    # page fetch itself failed, this row was NOT updated this run (fetched_at
    # still reflects the last successful scrape). Callers should treat
    # 'failed' rows as stale, not as "confirmed no data."
    fetch_status: Mapped[str] = mapped_column(String(16), default="ok")
    source_tier: Mapped[str] = mapped_column(String(32), default="tier3_screener_bulk")
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
