"""Integration test for the mutual fund SQL (upserts, queues, screener query).

Runs only against a throwaway Postgres: set MF_TEST_DATABASE_URL to an
asyncpg URL whose schema is migrated to head. NEVER point it at a shared
database — the test truncates the mf_* tables.
"""

import os
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.ingestion.mf_amfi import parse_navall
from app.services import mf_ingest, mf_query
from app.services.mf_query import FundFilters

URL = os.environ.get("MF_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.skipif(not URL, reason="MF_TEST_DATABASE_URL not set"),
    pytest.mark.asyncio(loop_scope="module"),
]
FIXTURE = Path(__file__).parent / "fixtures" / "navall_sample.txt"
END = date(2026, 11, 17)


def _rows() -> list[dict]:
    out = []
    for r in parse_navall(FIXTURE.read_text()):
        out.append({
            "scheme_code": r.scheme_code, "name": r.name, "base_name": r.base_name,
            "fund_house": r.fund_house, "scheme_type": r.scheme_type, "category": r.category,
            "sub_category": r.sub_category, "plan": r.plan, "option": r.option,
            "isin_growth": r.isin_growth, "isin_reinvest": r.isin_reinvest,
            "latest_nav": float(r.nav) if r.nav else None,
            "latest_nav_date": r.nav_date.isoformat() if r.nav_date else None,
        })
    return out


def _history(days: int, daily: float, last: float = 85.1234) -> list[list]:
    """Compounding NAVs ending exactly at `last` (the NAV the scheme master already holds)."""
    return [
        [(END - timedelta(days=i)).isoformat(), round(last / (1 + daily) ** i, 4)]
        for i in range(days - 1, -1, -1)
    ]


@pytest.fixture(scope="module")
async def session():
    engine = create_async_engine(URL)
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE mf_factsheet, mf_metrics, mf_nav, mf_schemes CASCADE"))
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        yield s
    await engine.dispose()


async def test_ingest_schemes_is_idempotent_and_flags_dormant(session: AsyncSession):
    first = await mf_ingest.ingest_schemes(session, _rows())
    second = await mf_ingest.ingest_schemes(session, _rows(), as_of=END)
    assert first["schemes"] == second["schemes"] == 5
    total = await session.scalar(text("SELECT count(*) FROM mf_schemes"))
    assert total == 5
    dormant = await session.scalar(text("SELECT is_active FROM mf_schemes WHERE scheme_code=100002"))
    assert dormant is False  # NAV from 2018


async def test_backfill_queue_then_metrics_then_screener(session: AsyncSession):
    assert await mf_ingest.backfill_queue(session, 10) == [122639]  # the only active Direct-Growth

    pts = _history(1900, 0.0004)
    out = await mf_ingest.ingest_nav(session, 122639, pts)
    assert out["inserted"] == 1900
    await mf_ingest.ingest_nav(session, 122639, pts)  # idempotent
    assert await session.scalar(text("SELECT count(*) FROM mf_nav WHERE scheme_code=122639")) == 1900
    assert (await mf_ingest.ingest_nav(session, 999, pts))["error"] == "unknown scheme"
    assert await mf_ingest.backfill_queue(session, 10) == []

    assert await mf_ingest.metrics_queue(session, after=0, limit=10) == [122639]
    assert await mf_ingest.metrics_queue(session, after=122639, limit=10) == []
    assert (await mf_ingest.recompute_metrics(session, [122639]))["computed"] == 1

    res = await mf_query.list_funds(session, FundFilters(min_ret_3y=1))
    assert res["total"] == 1 and res["items"][0]["scheme_code"] == 122639
    assert res["items"][0]["ret_5y"] is not None and res["items"][0]["ret_10y"] is None
    assert (await mf_query.list_funds(session, FundFilters(min_ret_3y=999)))["total"] == 0
    assert (await mf_query.list_funds(session, FundFilters(q="flexi%")))["total"] == 0  # % is literal
    assert (await mf_query.list_funds(session, FundFilters(q="flexi", plan=None, option=None)))["total"] == 3
    by_name = await mf_query.list_funds(session, FundFilters(sort="name", order="asc", plan=None, option=None))
    assert [i["name"] for i in by_name["items"]] == sorted(i["name"] for i in by_name["items"])


async def test_detail_nav_history_facets_peers_factsheet(session: AsyncSession):
    detail = await mf_query.get_fund(session, 122639)
    assert detail["factsheet"] is None and detail["is_active"] is True
    assert (await mf_query.get_fund(session, 100002))["is_active"] is False  # dormant still viewable
    assert await mf_query.get_fund(session, 1) is None

    one_year = await mf_query.get_nav_history(session, 122639, "1y")
    assert 360 <= len(one_year) <= 367 and one_year[0]["date"] < one_year[-1]["date"]
    assert len(await mf_query.get_nav_history(session, 122639, "max")) == 1900

    fx = await mf_query.get_facets(session)
    assert "Equity" in fx["categories"] and "PPFAS" not in fx["fund_houses"]
    assert fx["sub_categories"]["Equity"] == ["Flexi Cap Fund"]

    written = await mf_ingest.ingest_factsheet(
        session,
        [{"scheme_code": 122639, "expense_ratio": 0.63, "aum_cr": 90000, "source": "test",
          "as_of": "2026-10-31"},
         {"scheme_code": 424242, "expense_ratio": 1.0, "source": "test"}],
    )
    assert written == {"written": 1, "skipped": 1}
    detail = await mf_query.get_fund(session, 122639)
    assert detail["expense_ratio"] == 0.63 and detail["factsheet"]["source"] == "test"
    capped = await mf_query.list_funds(session, FundFilters(max_expense_ratio=0.5))
    assert capped["total"] == 0
    assert await mf_query.get_peers(session, 122639) == []  # no other Direct-Growth flexi cap


async def test_batch_judges_activity_against_file_wide_as_of(session: AsyncSession):
    stale_only = [r for r in _rows() if r["scheme_code"] == 100002]
    await mf_ingest.ingest_schemes(session, stale_only)  # alone, it would look "newest"
    assert await session.scalar(text("SELECT is_active FROM mf_schemes WHERE scheme_code=100002")) is True
    await mf_ingest.ingest_schemes(session, stale_only, as_of=END)
    assert await session.scalar(text("SELECT is_active FROM mf_schemes WHERE scheme_code=100002")) is False


async def test_duplicate_codes_in_one_batch_do_not_fail_the_batch(session: AsyncSession):
    row = next(r for r in _rows() if r["scheme_code"] == 122639)
    out = await mf_ingest.ingest_schemes(session, [row, {**row, "latest_nav": 90.0}], as_of=END)
    assert out["schemes"] == 1


async def test_scheme_missing_from_file_goes_dormant(session: AsyncSession):
    ghost = {**next(r for r in _rows() if r["scheme_code"] == 122640), "scheme_code": 555555,
             "latest_nav_date": "2026-11-01"}
    await mf_ingest.ingest_schemes(session, [ghost], as_of=date(2026, 11, 1))
    assert await session.scalar(text("SELECT is_active FROM mf_schemes WHERE scheme_code=555555")) is True
    # a later file no longer lists it; any batch with a newer as_of retires it
    out = await mf_ingest.ingest_schemes(session, [next(r for r in _rows() if r["scheme_code"] == 122639)], as_of=END)
    assert out["deactivated"] >= 1
    assert await session.scalar(text("SELECT is_active FROM mf_schemes WHERE scheme_code=555555")) is False


async def test_empty_history_still_leaves_the_backfill_queue(session: AsyncSession):
    await mf_ingest.ingest_schemes(session, [next(r for r in _rows() if r["scheme_code"] == 122639)], as_of=END)
    await session.execute(text("UPDATE mf_schemes SET history_checked_at=NULL WHERE scheme_code=122639"))
    await session.commit()
    assert 122639 in await mf_ingest.backfill_queue(session, 10)
    await mf_ingest.ingest_nav(session, 122639, [])
    assert 122639 not in await mf_ingest.backfill_queue(session, 10)


async def test_non_finite_nav_points_are_dropped(session: AsyncSession):
    out = await mf_ingest.ingest_nav(session, 122639, [["2020-01-01", float("inf")], ["2020-01-02", 1e12],
                                                       ["2020-01-03", 12.5]])
    assert out["inserted"] == 1


def _filler(n: int):
    from app.ingestion.mf_ter import TerRow

    return [TerRow(f"Filler Scheme Number {i}", 1.0, 0.5) for i in range(n)]


async def test_ter_ingest_matches_by_name_keeps_other_fields_and_clears_stale(session: AsyncSession):
    from app.ingestion.mf_ter import TerRow

    await mf_ingest.ingest_schemes(session, _rows(), as_of=END)
    await mf_ingest.ingest_factsheet(session, [{"scheme_code": 122639, "aum_cr": 90000, "source": "manual"}])

    too_few = await mf_ingest.ingest_ter(session, [TerRow("Parag Parikh Flexi Cap Fund", 1.5, 0.63)], END)
    assert "refusing" in too_few["error"]

    rows = [TerRow("Parag Parikh Flexi Cap Fund", 1.5, 0.63), *_filler(600)]
    out = await mf_ingest.ingest_ter(session, rows, END)
    assert out["matched_rows"] == 1 and out["schemes_filled"] == 3

    async def ter(code: int):
        return await session.scalar(text("SELECT expense_ratio FROM mf_factsheet WHERE scheme_code=:c"), {"c": code})

    assert float(await ter(122639)) == 0.63      # Direct Growth
    assert float(await ter(153964)) == 0.63      # Direct IDCW shares the plan's TER
    assert float(await ter(122640)) == 1.5       # Regular Growth
    assert float(await session.scalar(text("SELECT aum_cr FROM mf_factsheet WHERE scheme_code=122639"))) == 90000
    assert await session.scalar(text("SELECT source FROM mf_factsheet WHERE scheme_code=122640")) == "AMFI TER via community tracker"

    # the fund drops out of a later file: its stale figure is cleared, the AUM is untouched
    out = await mf_ingest.ingest_ter(session, _filler(600), END)
    assert out["cleared"] == 3 and await ter(122640) is None
    assert float(await session.scalar(text("SELECT aum_cr FROM mf_factsheet WHERE scheme_code=122639"))) == 90000
