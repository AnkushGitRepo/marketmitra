"""Offline tests for Tier 1 filing-URL discovery. No network: the NSE/BSE
fetches and the file download are monkeypatched. The parsers run against
fixtures built to the documented response shapes (see module docstring in
`filing_discovery.py`).
"""

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from app.ingestion import filing_discovery as fd
from app.schemas import PeriodType, StatementType

FIXTURES = Path(__file__).parent / "fixtures"
NSE_RESULTS = json.loads((FIXTURES / "nse_financial_results.json").read_text())
BSE_ANNS = json.loads((FIXTURES / "bse_annget_data.json").read_text())
XBRL_BYTES = (FIXTURES / "sample_xbrl_result.xml").read_bytes()


# --- pure parsers ---------------------------------------------------------


def test_parse_nse_maps_fields_and_drops_empty_filings():
    refs = fd.parse_nse_financial_results(NSE_RESULTS)
    # the 4th record has neither xbrl nor pdf -> dropped
    assert len(refs) == 3
    q1_consol = next(r for r in refs if r.period_end == date(2026, 6, 30) and r.is_consolidated)
    assert q1_consol.exchange == "NSE"
    assert q1_consol.period_type == PeriodType.QUARTERLY
    assert q1_consol.xbrl_url.endswith("INDAS_2026_Q1_RELIANCE.xml")
    assert q1_consol.pdf_url.endswith("RELIANCE_Q1FY27.pdf")
    assert q1_consol.filed_at == date(2026, 7, 18)


def test_parse_nse_accepts_the_data_wrapper_shape():
    assert fd.parse_nse_financial_results({"data": NSE_RESULTS})
    assert fd.parse_nse_financial_results("nonsense") == []
    assert fd.parse_nse_financial_results({"no": "data"}) == []


def test_parse_bse_keeps_results_with_a_parseable_period_only():
    refs = fd.parse_bse_annget_data(BSE_ANNS)
    # of 4 rows: board-meeting (wrong category) and "no-period" (no date in
    # subject) are dropped -> 2 remain
    assert len(refs) == 2
    q1 = next(r for r in refs if r.period_end == date(2026, 6, 30))
    assert q1.exchange == "BSE"
    assert q1.pdf_url.startswith(fd._BSE_ATTACH_BASE)
    assert q1.pdf_url.endswith(".pdf")
    assert q1.is_consolidated is True
    assert q1.period_type == PeriodType.QUARTERLY
    fy = next(r for r in refs if r.period_end == date(2026, 3, 31))
    assert fy.period_type == PeriodType.ANNUAL


def test_period_helpers():
    assert fd._period_end_from_text("Results for the quarter ended June 30, 2026") == date(2026, 6, 30)
    assert fd._period_end_from_text("Results for the year ended 31st March, 2026") == date(2026, 3, 31)
    assert fd._period_end_from_text("no date here") is None
    assert fd._period_type_for(date(2026, 3, 31), None) == PeriodType.ANNUAL  # March => annual
    assert fd._period_type_for(date(2026, 6, 30), None) == PeriodType.QUARTERLY
    assert fd._period_type_for(date(2026, 6, 30), "Annual results") == PeriodType.ANNUAL


def test_pick_latest_prefers_newest_then_consolidated_then_xbrl():
    a = fd.FilingRef("NSE", date(2026, 6, 30), PeriodType.QUARTERLY, False, None, "p.pdf", None)
    b = fd.FilingRef("NSE", date(2026, 6, 30), PeriodType.QUARTERLY, True, None, "p.pdf", None)
    c = fd.FilingRef("NSE", date(2026, 3, 31), PeriodType.ANNUAL, True, "x.xml", None, None)
    assert fd.pick_latest([a, b, c]) is b  # newer period than c; consolidated beats a
    assert fd.pick_latest([]) is None


# --- discover_latest_financial_filing (mocked fetch) ---------------------


@pytest.mark.asyncio
async def test_discover_uses_nse_then_picks_the_latest(monkeypatch):
    async def fake_nse(symbol):
        assert symbol == "RELIANCE"
        return NSE_RESULTS

    monkeypatch.setattr(fd, "_fetch_nse_financial_results", fake_nse)
    ref = await fd.discover_latest_financial_filing("RELIANCE", "500325")
    assert ref is not None
    assert ref.exchange == "NSE"
    assert ref.period_end == date(2026, 6, 30)
    assert ref.is_consolidated and ref.xbrl_url  # consolidated + has XBRL wins the tiebreak


@pytest.mark.asyncio
async def test_discover_falls_back_to_bse_when_nse_errors(monkeypatch):
    async def boom(symbol):
        raise httpx.ConnectError("NSE blocked at the edge")

    async def fake_bse(code):
        assert code == "500325"
        return BSE_ANNS

    monkeypatch.setattr(fd, "_fetch_nse_financial_results", boom)
    monkeypatch.setattr(fd, "_fetch_bse_announcements", fake_bse)
    ref = await fd.discover_latest_financial_filing("RELIANCE", "500325")
    assert ref is not None
    assert ref.exchange == "BSE"
    assert ref.period_end == date(2026, 6, 30)


@pytest.mark.asyncio
async def test_discover_returns_none_when_everything_fails(monkeypatch):
    async def boom(*a):
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(fd, "_fetch_nse_financial_results", boom)
    monkeypatch.setattr(fd, "_fetch_bse_announcements", boom)
    assert await fd.discover_latest_financial_filing("RELIANCE", "500325") is None


@pytest.mark.asyncio
async def test_discover_respects_the_disable_flag(monkeypatch):
    monkeypatch.setattr(fd._settings, "financials_tier1_enabled", False)
    called = False

    async def fake_nse(symbol):
        nonlocal called
        called = True
        return NSE_RESULTS

    monkeypatch.setattr(fd, "_fetch_nse_financial_results", fake_nse)
    assert await fd.discover_latest_financial_filing("RELIANCE", "500325") is None
    assert called is False


# --- extract_tier1_line_items (mocked download) ------------------------


@pytest.mark.asyncio
async def test_extract_from_xbrl_attaches_the_discovered_period(monkeypatch):
    async def fake_dl(url):
        assert url.endswith(".xml")
        return XBRL_BYTES

    monkeypatch.setattr(fd, "_download", fake_dl)
    filing = fd.FilingRef(
        "NSE", date(2026, 6, 30), PeriodType.QUARTERLY, True,
        "https://x/INDAS.xml", None, None,
    )
    items = await fd.extract_tier1_line_items(filing, StatementType.PROFIT_AND_LOSS)
    assert items, "expected P&L line items from the XBRL fixture"
    assert all(i["period_end"] == date(2026, 6, 30) for i in items)
    assert all(i["period_type"] == PeriodType.QUARTERLY for i in items)
    revenue = next(i for i in items if i["label"] == "Revenue from Operations")
    # Raw XBRL fact is in absolute rupees; scaled to crore (ADR — matches
    # every other source feeding this table).
    assert revenue["value"] == Decimal("238.5")
    # balance-sheet statement asked for a different type -> only its own items
    bs_items = await fd.extract_tier1_line_items(filing, StatementType.BALANCE_SHEET)
    assert all(i["label"] != "Revenue from Operations" for i in bs_items)


@pytest.mark.asyncio
async def test_extract_returns_empty_when_download_fails(monkeypatch):
    async def boom(url):
        raise httpx.HTTPStatusError("404", request=None, response=None)

    monkeypatch.setattr(fd, "_download", boom)
    filing = fd.FilingRef(
        "NSE", date(2026, 6, 30), PeriodType.QUARTERLY, False, "https://x/a.xml", "https://x/a.pdf", None
    )
    assert await fd.extract_tier1_line_items(filing, StatementType.PROFIT_AND_LOSS) == []


# --- wiring: Tier 1 short-circuits the Tier 3 scrape -------------------


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return iter(self._rows)


class _FakeSession:
    def __init__(self):
        self.commits = 0

    async def execute(self, _stmt):
        return _FakeResult([])

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_get_financial_statement_prefers_tier1_and_skips_tier3(monkeypatch):
    from app.db.models import CompanyORM
    from app.services import fundamentals_service as svc

    company = CompanyORM(id=1, nse_symbol="RELIANCE", bse_code="500325")

    async def fake_discover(nse, bse):
        return fd.FilingRef(
            "NSE", date(2026, 6, 30), PeriodType.QUARTERLY, True, "https://x/a.xml", None, None
        )

    async def fake_extract(filing, statement_type):
        return [
            {
                "label": "Revenue from Operations",
                "value": Decimal(100),
                "period_end": date(2026, 6, 30),
                "period_type": PeriodType.QUARTERLY,
            }
        ]

    tier3_called = False

    async def fake_tier3(symbol, statement_type):
        nonlocal tier3_called
        tier3_called = True
        return []

    monkeypatch.setattr(svc.filing_discovery, "discover_latest_financial_filing", fake_discover)
    monkeypatch.setattr(svc.filing_discovery, "extract_tier1_line_items", fake_extract)
    monkeypatch.setattr(svc.tier3, "fetch_financial_statement", fake_tier3)

    await svc.get_financial_statement(_FakeSession(), company, StatementType.PROFIT_AND_LOSS)
    assert tier3_called is False


@pytest.mark.asyncio
async def test_get_financial_statement_falls_back_to_tier3(monkeypatch):
    from app.db.models import CompanyORM
    from app.services import fundamentals_service as svc

    company = CompanyORM(id=1, nse_symbol="RELIANCE", bse_code="500325")
    tier3_called = False

    async def fake_discover(nse, bse):
        return None

    async def fake_tier3(symbol, statement_type):
        nonlocal tier3_called
        tier3_called = True
        return []

    monkeypatch.setattr(svc.filing_discovery, "discover_latest_financial_filing", fake_discover)
    monkeypatch.setattr(svc.tier3, "fetch_financial_statement", fake_tier3)

    await svc.get_financial_statement(_FakeSession(), company, StatementType.PROFIT_AND_LOSS)
    assert tier3_called is True
