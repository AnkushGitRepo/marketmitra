"""Real-SQL test of the Yahoo cash, debt and enterprise-value storage (#365).

Runs only against a throwaway Postgres: set ENTERPRISE_TEST_DATABASE_URL to an asyncpg URL whose schema is migrated to
head. NEVER point it at a shared database: the test creates and deletes companies. Yahoo and Screener are replaced
with fakes, so no network is used.
"""

import os
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import CompanyORM, FinancialLineItemORM, RatioORM
from app.schemas import PeriodType, StatementType
from app.services import fundamentals_service as svc

URL = os.environ.get("ENTERPRISE_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.skipif(not URL, reason="ENTERPRISE_TEST_DATABASE_URL not set"),
    pytest.mark.asyncio(loop_scope="module"),
]

INFO = {"financialCurrency": "INR", "enterpriseValue": 22_581_224_669_184, "totalCash": 2_603_139_989_504, "totalDebt": 5_020_490_137_600, "ebitda": 1_868_889_980_928}
BS = {
    "Total Debt": {date(2026, 3, 31): 3_980_000_000_000.0, date(2025, 3, 31): 3_695_750_000_000.0},
    "Cash Cash Equivalents And Short Term Investments": {date(2026, 3, 31): 2_772_120_000_000.0},
}
SYMBOLS = ("ZZENTCO", "ZZENTBANK", "ZZENTMISS")


@pytest.fixture(scope="module")
async def session():
    engine = create_async_engine(URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        await s.execute(text("DELETE FROM companies WHERE nse_symbol = ANY(:s)"), {"s": list(SYMBOLS)})
        s.add_all([
            CompanyORM(nse_symbol="ZZENTCO", name="Ent Co", sector="Energy"),
            CompanyORM(nse_symbol="ZZENTBANK", name="Ent Bank", sector="Financial Services"),
            CompanyORM(nse_symbol="ZZENTMISS", name="Ent Miss", sector="Energy"),
        ])
        await s.commit()
        yield s
        await s.execute(text("DELETE FROM companies WHERE nse_symbol = ANY(:s)"), {"s": list(SYMBOLS)})
        await s.commit()
    await engine.dispose()


@pytest.fixture(autouse=True)
def _fresh_cache():
    svc._enterprise_cache.clear()


async def _company(session, symbol):
    return (await session.execute(select(CompanyORM).where(CompanyORM.nse_symbol == symbol))).scalar_one()


class _Yahoo:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def __call__(self, *_a, **_k):
        self.calls += 1
        return self.result


@pytest.fixture
def screener(monkeypatch):
    async def ratios(_symbol):
        return [{"name": "Stock P/E", "value": Decimal("22.6"), "unit": None}]

    async def statement(_symbol, statement_type):
        return [{"label": "Borrowings", "period_type": PeriodType.ANNUAL, "period_end": date(2026, 3, 31), "value": Decimal(403000)}] if statement_type is StatementType.BALANCE_SHEET else []

    async def no_filing(*_a, **_k):
        return None

    monkeypatch.setattr(svc.tier3, "fetch_ratios", ratios)
    monkeypatch.setattr(svc.tier3, "fetch_financial_statement", statement)
    monkeypatch.setattr(svc.filing_discovery, "discover_latest_financial_filing", no_filing)


async def test_ratios_gain_enterprise_value_net_debt_and_the_multiple_from_yahoo(session, screener, monkeypatch):
    yahoo = _Yahoo({"info": INFO, "balance_sheet": BS})
    monkeypatch.setattr(svc.tier2_yfinance, "get_enterprise_data", yahoo)
    company = await _company(session, "ZZENTCO")

    ratios = {r.name: r for r in await svc.get_ratios(session, company)}
    assert ratios["Stock P/E"].source_tier == "tier3_screener"
    assert ratios["Enterprise Value"].source_tier == "tier2_yfinance"
    assert float(ratios["Net Debt"].value) == pytest.approx(241735.01)
    assert float(ratios["EV/EBITDA"].value) == pytest.approx(12.08, abs=0.01)
    assert ratios["EV/EBITDA"].unit == "x"
    assert yahoo.calls == 1


async def test_the_balance_sheet_gains_debt_and_cash_rows_and_yahoo_is_asked_once(session, screener, monkeypatch):
    yahoo = _Yahoo({"info": INFO, "balance_sheet": BS})
    monkeypatch.setattr(svc.tier2_yfinance, "get_enterprise_data", yahoo)
    company = await _company(session, "ZZENTCO")

    items = await svc.get_financial_statement(session, company, StatementType.BALANCE_SHEET)
    by_label = {(i.label, i.period_end): float(i.value) for i in items}
    assert by_label[("Borrowings", date(2026, 3, 31))] == 403000.0  # Screener's row is untouched
    assert by_label[("Total Debt", date(2026, 3, 31))] == 398000.0
    assert by_label[("Cash and Short-Term Investments", date(2026, 3, 31))] == 277212.0
    assert {i.source_tier for i in items if i.label == "Total Debt"} == {"tier2_yfinance"}

    again = await svc.get_financial_statement(session, company, StatementType.BALANCE_SHEET)
    assert len(again) == len(items)
    assert yahoo.calls == 1  # fresh rows: no second fetch


async def test_a_bank_gets_no_enterprise_figures_and_yahoo_is_not_even_asked_for_its_balance_sheet(session, screener, monkeypatch):
    yahoo = _Yahoo({"info": INFO, "balance_sheet": BS})
    monkeypatch.setattr(svc.tier2_yfinance, "get_enterprise_data", yahoo)
    bank = await _company(session, "ZZENTBANK")

    items = await svc.get_financial_statement(session, bank, StatementType.BALANCE_SHEET)
    assert {i.label for i in items} == {"Borrowings"}
    assert yahoo.calls == 0
    names = {r.name for r in await svc.get_ratios(session, bank)}
    assert "Enterprise Value" not in names and "Stock P/E" in names


async def test_a_yahoo_miss_leaves_the_statement_alone_and_is_remembered(session, screener, monkeypatch):
    yahoo = _Yahoo(None)
    monkeypatch.setattr(svc.tier2_yfinance, "get_enterprise_data", yahoo)
    company = await _company(session, "ZZENTMISS")

    first = await svc.get_financial_statement(session, company, StatementType.BALANCE_SHEET)
    second = await svc.get_financial_statement(session, company, StatementType.BALANCE_SHEET)
    assert {i.label for i in first} == {"Borrowings"} == {i.label for i in second}
    assert yahoo.calls == 1  # the miss is cached, so a down Yahoo is not hit on every request
    rows = (await session.execute(select(FinancialLineItemORM).where(FinancialLineItemORM.company_id == company.id, FinancialLineItemORM.label == "Total Debt"))).scalars().all()
    assert rows == []
    assert "Enterprise Value" not in {r.name for r in (await session.execute(select(RatioORM).where(RatioORM.company_id == company.id))).scalars()}
