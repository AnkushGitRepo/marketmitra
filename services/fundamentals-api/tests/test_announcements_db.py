"""Real-SQL test of the announcement, insight and ratios storage (#365).

Runs only against a throwaway Postgres: set ANNOUNCEMENTS_TEST_DATABASE_URL to an asyncpg URL whose schema is migrated to
head. NEVER point it at a shared database: the test deletes the company it creates, and everything cascades from it.
The Screener fetchers are replaced with the real parsers run on the saved Newgen page, so no network is used.
"""

import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from scrapling import Selector
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import CompanyAnnouncementORM, CompanyInsightORM, CompanyORM
from app.ingestion.tier3_screener_scrapling import scraper
from app.schemas import StatementType
from app.services import fundamentals_service as svc

URL = os.environ.get("ANNOUNCEMENTS_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.skipif(not URL, reason="ANNOUNCEMENTS_TEST_DATABASE_URL not set"),
    pytest.mark.asyncio(loop_scope="module"),
]
FIXTURE = Path(__file__).parent / "fixtures" / "screener_newgen_consolidated.html"
SYMBOL = "ZZTESTANN"


@pytest.fixture(scope="module")
def page():
    return Selector(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
async def session():
    engine = create_async_engine(URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        await s.execute(text("DELETE FROM companies WHERE nse_symbol = :s"), {"s": SYMBOL})
        company = CompanyORM(nse_symbol=SYMBOL, name="Test Announcements Ltd")
        s.add(company)
        await s.commit()
        yield s
        await s.execute(text("DELETE FROM companies WHERE nse_symbol = :s"), {"s": SYMBOL})
        await s.commit()
    await engine.dispose()


async def _company(session: AsyncSession) -> CompanyORM:
    return (await session.execute(select(CompanyORM).where(CompanyORM.nse_symbol == SYMBOL))).scalar_one()


async def _age(session: AsyncSession, model, company_id: int) -> None:
    await session.execute(
        update(model).where(model.company_id == company_id).values(fetched_at=datetime.now(UTC) - timedelta(days=3))
    )
    await session.commit()


async def test_announcements_are_stored_newest_first_and_served_from_the_table_within_the_ttl(session, page, monkeypatch):
    calls = []

    async def fake(symbol):
        calls.append(symbol)
        return scraper._parse_announcements(page)

    monkeypatch.setattr(svc.tier3, "fetch_announcements", fake)
    company = await _company(session)

    first = await svc.get_announcements(session, company)
    assert calls == [SYMBOL]
    assert len(first) >= 5
    dated = [a.announced_on for a in first if a.announced_on]
    assert dated == sorted(dated, reverse=True)
    assert first[0].title == "Announcement under Regulation 30 (LODR)-Credit Rating"
    assert first[0].category == "credit_rating"
    # Dateless rows (credit-rating links with a relative date) sort after every dated one.
    undated_at = [i for i, a in enumerate(first) if a.announced_on is None]
    assert not undated_at or min(undated_at) > max(i for i, a in enumerate(first) if a.announced_on)

    again = await svc.get_announcements(session, company)
    assert calls == [SYMBOL]  # fresh: no second scrape
    assert [a.id for a in again] == [a.id for a in first]


async def test_a_stale_refresh_adds_only_the_new_announcements(session, page, monkeypatch):
    company = await _company(session)
    before = len(await svc.get_announcements(session, company, limit=200))
    await _age(session, CompanyAnnouncementORM, company.id)

    async def fake(_symbol):
        scraped = scraper._parse_announcements(page)
        scraped.insert(0, {
            "announced_on": date(2026, 9, 5), "title": "Disclosure of material litigation", "summary": "Order from NCLT",
            "url": "https://example.test/ann/new.pdf", "category": "litigation",
        })
        return scraped

    monkeypatch.setattr(svc.tier3, "fetch_announcements", fake)
    after = await svc.get_announcements(session, company, limit=200)
    assert len(after) == before + 1  # the new one; the rest were upserted, not duplicated
    assert after[0].title == "Disclosure of material litigation"
    assert after[0].category == "litigation"


async def test_a_failed_scrape_keeps_what_is_stored(session, monkeypatch):
    company = await _company(session)
    stored = await svc.get_announcements(session, company, limit=200)
    await _age(session, CompanyAnnouncementORM, company.id)

    async def empty(_symbol):
        return []

    monkeypatch.setattr(svc.tier3, "fetch_announcements", empty)
    assert len(await svc.get_announcements(session, company, limit=200)) == len(stored)


async def test_insights_are_replaced_as_a_set_on_refresh(session, page, monkeypatch):
    company = await _company(session)

    async def first(_symbol):
        return scraper._parse_insights(page)

    monkeypatch.setattr(svc.tier3, "fetch_insights", first)
    stored = await svc.get_insights(session, company)
    assert [i.kind for i in stored][:1] == ["pro"]
    assert any(i.kind == "con" and "high debtors" in i.text for i in stored)

    await _age(session, CompanyInsightORM, company.id)

    async def second(_symbol):
        return [{"kind": "con", "text": "Company has a low interest coverage ratio."}]

    monkeypatch.setattr(svc.tier3, "fetch_insights", second)
    replaced = await svc.get_insights(session, company)
    assert [(i.kind, i.text) for i in replaced] == [("con", "Company has a low interest coverage ratio.")]


async def test_ratios_statement_goes_straight_to_screener_and_stores_working_capital_days(session, page, monkeypatch):
    company = await _company(session)

    async def no_filing(*_a, **_k):
        raise AssertionError("the Ratios section has no filing: discovery must not run")

    async def fake(_symbol, statement_type):
        return scraper._parse_financial_statement(page, statement_type)

    monkeypatch.setattr(svc.filing_discovery, "discover_latest_financial_filing", no_filing)
    monkeypatch.setattr(svc.tier3, "fetch_financial_statement", fake)

    items = await svc.get_financial_statement(session, company, StatementType.RATIOS)
    assert {i.label for i in items} >= {"Debtor Days", "Working Capital Days", "Cash Conversion Cycle"}
    latest = next(i for i in items if i.label == "Working Capital Days" and i.period_end == date(2026, 3, 31))
    assert float(latest.value) == 81.0
    assert latest.statement_type == "ratios"
