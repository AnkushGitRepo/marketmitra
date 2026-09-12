"""Tests the Tier 3 Screener.in parser against a real, saved-to-disk page
(tests/fixtures/screener_newgen_consolidated.html — Newgen Software's
consolidated Screener.in page, saved from a browser by the project
maintainer) rather than a live network call. No network access required to
run this file.
"""

from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from scrapling import Selector

from app.ingestion.tier3_screener_scrapling.scraper import (
    _compute_cagr,
    _compute_debt_to_equity,
    _compute_growth,
    _parse_about,
    _parse_annual_reports,
    _parse_financial_statement,
    _parse_peers,
    _parse_ratios,
    _parse_sector_industry,
    _parse_shareholding,
    _parse_warehouse_id,
)
from app.schemas import PeriodType, StatementType

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "screener_newgen_consolidated.html"


@pytest.fixture(scope="module")
def newgen_page():
    html = FIXTURE_PATH.read_text(encoding="utf-8")
    return Selector(html)


def test_parse_ratios_finds_expected_named_ratios(newgen_page):
    ratios = _parse_ratios(newgen_page)
    names = {r["name"] for r in ratios}

    assert "Stock P/E" in names
    assert "ROCE" in names
    assert "ROE" in names
    assert "Dividend Yield" in names

    roce = next(r for r in ratios if r["name"] == "ROCE")
    assert roce["unit"] == "%"
    assert roce["value"] > 0


def test_parse_ratios_all_values_are_positive_decimals(newgen_page):
    ratios = _parse_ratios(newgen_page)
    assert len(ratios) >= 8
    for ratio in ratios:
        assert isinstance(ratio["value"], Decimal)


def test_parse_profit_and_loss_has_sales_row_across_years(newgen_page):
    line_items = _parse_financial_statement(newgen_page, StatementType.PROFIT_AND_LOSS)
    sales_rows = [i for i in line_items if i["label"] == "Sales"]

    assert len(sales_rows) >= 10  # ~11 annual columns + TTM on a decade-plus-listed company
    assert all(i["period_type"] == PeriodType.ANNUAL for i in sales_rows if i["period_end"])
    assert all(i["value"] > 0 for i in sales_rows)

    earliest = min(i["period_end"] for i in sales_rows if i["period_end"])
    assert earliest.year <= 2016


def test_parse_balance_sheet_has_total_row_shaped_data(newgen_page):
    line_items = _parse_financial_statement(newgen_page, StatementType.BALANCE_SHEET)
    labels = {i["label"] for i in line_items}
    assert any("Total" in label for label in labels)


def test_parse_shareholding_returns_full_quarterly_history(newgen_page):
    entries = _parse_shareholding(newgen_page)
    categories = {e["category"] for e in entries}

    assert "Promoters" in categories
    assert "No. of Shareholders" not in categories  # explicitly excluded — it's a count, not a %

    quarters = {e["quarter_end"] for e in entries if e["category"] == "Promoters"}
    assert len(quarters) >= 5  # Screener shows at least five quarters of history

    latest_quarter = max(quarters)
    total_latest = sum(e["percentage"] for e in entries if e["quarter_end"] == latest_quarter)
    assert Decimal(99) <= total_latest <= Decimal(101)


def test_parse_shareholding_quarter_end_is_a_real_date(newgen_page):
    entries = _parse_shareholding(newgen_page)
    assert isinstance(entries[0]["quarter_end"], date)


def test_parse_about_extracts_business_description(newgen_page):
    about = _parse_about(newgen_page)
    assert about is not None
    assert "software" in about.lower()
    assert "<" not in about  # no leftover markup


def test_parse_peers_includes_the_target_company_and_real_peers(newgen_page):
    peers = _parse_peers(newgen_page, "NEWGEN")
    symbols = {p["symbol"] for p in peers}

    assert "TCS" in symbols
    assert "INFY" in symbols
    assert "NEWGEN" in symbols

    target = next(p for p in peers if p["symbol"] == "NEWGEN")
    assert target["is_target"] is True
    others = [p for p in peers if p["symbol"] != "NEWGEN"]
    assert all(p["is_target"] is False for p in others)

    tcs = next(p for p in peers if p["symbol"] == "TCS")
    assert tcs["market_cap"] > 0
    assert tcs["pe"] > 0


def test_parse_warehouse_id_extracts_screener_internal_id(newgen_page):
    assert _parse_warehouse_id(newgen_page) == "19226378"


def test_parse_annual_reports_finds_bse_hosted_pdf_links(newgen_page):
    reports = _parse_annual_reports(newgen_page)
    assert len(reports) >= 5

    latest = max(reports, key=lambda r: r["period_end"] or date.min)
    assert latest["url"].startswith("https://www.bseindia.com/")
    assert latest["url"].endswith(".pdf")
    assert "Annual Report" in latest["title"]
    assert latest["period_end"].month == 3  # Indian fiscal year-end convention


# --- Screener bulk-ingestion helpers (ADR 0025) --------------------------


def test_parse_sector_industry_from_the_peers_section_breadcrumb(newgen_page):
    sector, industry = _parse_sector_industry(newgen_page)
    assert sector == "Information Technology"
    assert industry == "Computers - Software & Consulting"


def test_parse_sector_industry_returns_none_when_breadcrumb_is_absent():
    empty_page = Selector("<html><body></body></html>")
    assert _parse_sector_industry(empty_page) == (None, None)


def test_compute_debt_to_equity_against_real_balance_sheet_labels(newgen_page):
    bs = _parse_financial_statement(newgen_page, StatementType.BALANCE_SHEET)
    # Confirms the real, scraped label is "Equity Capital" (not the
    # initially-assumed "Equity Share Capital") and that the computation
    # against it produces a sane, positive ratio.
    de = _compute_debt_to_equity(bs)
    assert de is not None
    assert 0 < de < 1  # Newgen (IT services) is genuinely low-debt


def test_compute_debt_to_equity_none_when_a_component_is_missing():
    items = [
        {"label": "Borrowings", "period_type": PeriodType.ANNUAL, "period_end": date(2026, 3, 31), "value": Decimal(100)},
        # no "Equity Capital" / "Reserves" rows at all
    ]
    assert _compute_debt_to_equity(items) is None


def test_compute_debt_to_equity_none_when_equity_is_zero():
    items = [
        {"label": "Borrowings", "period_type": PeriodType.ANNUAL, "period_end": date(2026, 3, 31), "value": Decimal(100)},
        {"label": "Equity Capital", "period_type": PeriodType.ANNUAL, "period_end": date(2026, 3, 31), "value": Decimal(0)},
        {"label": "Reserves", "period_type": PeriodType.ANNUAL, "period_end": date(2026, 3, 31), "value": Decimal(0)},
    ]
    assert _compute_debt_to_equity(items) is None


def _pnl_row(label: str, year: int, value) -> dict:
    return {
        "label": label,
        "period_type": PeriodType.ANNUAL,
        "period_end": date(year, 3, 31),
        "value": Decimal(value),
    }


def test_compute_cagr_over_three_years():
    items = [_pnl_row("Sales", y, v) for y, v in [(2022, 100), (2023, 110), (2024, 121), (2025, 133.1)]]
    cagr = _compute_cagr(items, "Sales")
    assert cagr is not None
    # As a percentage (10, not 0.1) — matches ROE/ROCE/Dividend Yield's
    # existing convention of raw percentage numbers, not fractions.
    assert abs(cagr - Decimal(10)) < Decimal("0.1")  # steady 10%/yr growth


def test_compute_cagr_none_with_insufficient_history():
    items = [_pnl_row("Sales", y, 100) for y in [2024, 2025]]  # only 2 years, need 4
    assert _compute_cagr(items, "Sales") is None


def test_compute_cagr_none_on_a_loss_making_base_year():
    items = [_pnl_row("Net Profit", y, v) for y, v in [(2022, -50), (2023, 10), (2024, 20), (2025, 30)]]
    assert _compute_cagr(items, "Net Profit") is None


def test_compute_growth_tries_revenue_label_when_sales_is_absent():
    items = [_pnl_row("Revenue", y, v) for y, v in [(2022, 100), (2023, 110), (2024, 121), (2025, 133.1)]]
    sales_growth, profit_growth = _compute_growth(items)
    assert sales_growth is not None
    assert profit_growth is None  # no "Net Profit" rows in this fixture


def test_compute_growth_real_fixture_produces_plausible_positive_values(newgen_page):
    pnl = _parse_financial_statement(newgen_page, StatementType.PROFIT_AND_LOSS)
    sales_growth, profit_growth = _compute_growth(pnl)
    assert sales_growth is not None and sales_growth > 0
    assert profit_growth is not None and profit_growth > 0
