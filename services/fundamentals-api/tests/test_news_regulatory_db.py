"""Real-SQL test of regulator notices in the news table (#365): kept out of the public feed, kept longer, indexed on request.

Runs only against a throwaway Postgres: set NEWS_TEST_DATABASE_URL to an asyncpg URL whose schema is migrated to head. NEVER
point it at a shared database: the test deletes every news item whose URL starts with https://zz.test/. The feeds are faked,
so no network is used.
"""

import os
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import NewsItemORM
from app.services import news_service as svc

URL = os.environ.get("NEWS_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.skipif(not URL, reason="NEWS_TEST_DATABASE_URL not set"),
    pytest.mark.asyncio(loop_scope="module"),
]
NOW = datetime.now(UTC)


def _item(path: str, source: str, days_old: float) -> dict:
    return {
        "url": f"https://zz.test/{path}",
        "title": f"Title {path}",
        "summary": None,
        "source": source,
        "published_at": NOW - timedelta(days=days_old),
        "sentiment": "neutral",
        "sentiment_score": 0.0,
    }


@pytest.fixture(scope="module")
async def session():
    engine = create_async_engine(URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as s:
        await s.execute(text("DELETE FROM news_items WHERE url LIKE 'https://zz.test/%'"))
        await s.commit()
        yield s
        await s.execute(text("DELETE FROM news_items WHERE url LIKE 'https://zz.test/%'"))
        await s.commit()
    await engine.dispose()


async def _urls(session) -> set[str]:
    rows = (await session.execute(select(NewsItemORM.url).where(NewsItemORM.url.like("https://zz.test/%")))).scalars()
    return {u.removeprefix("https://zz.test/") for u in rows}


async def test_regulator_notices_are_left_out_of_the_news_feed_unless_asked_for(session, monkeypatch):
    await svc._store(
        session,
        [_item("mint", "Mint", 0.1), _item("rbi", "RBI press release", 0.2), _item("trai", "TRAI", 0.3)],
        symbols=[],
    )
    monkeypatch.setattr(svc, "_is_stale", lambda *_a, **_k: False)  # no network refresh

    plain = {i["url"].removeprefix("https://zz.test/") for i in (await svc.get_news(session, limit=50))["items"]}
    assert "mint" in plain
    assert not {"rbi", "trai"} & plain

    everything = {i["url"].removeprefix("https://zz.test/") for i in (await svc.get_news(session, limit=50, include_regulatory=True))["items"]}
    assert {"mint", "rbi", "trai"} <= everything


async def test_news_is_pruned_after_30_days_but_regulator_notices_after_180(session):
    await svc._store(
        session,
        [
            _item("old-mint", "Mint", 40),
            _item("old-rbi-100d", "RBI press release", 100),
            _item("old-sebi-200d", "SEBI", 200),
            _item("fresh-mint", "Mint", 5),
        ],
        symbols=[],
    )
    await svc._prune(session)
    left = await _urls(session)
    assert "old-mint" not in left
    assert "old-sebi-200d" not in left
    assert {"old-rbi-100d", "fresh-mint"} <= left


async def test_a_refresh_stores_policy_notices_and_survives_an_empty_news_fetch(session, monkeypatch):
    async def no_news():
        return []

    async def notices():
        return [_item("refresh-rbi", "RBI press release", 0.5)]

    async def populated(_session):
        return None

    monkeypatch.setattr(svc.ingest, "fetch_broad_items", no_news)
    monkeypatch.setattr(svc.regulators, "fetch_regulator_items", notices)
    monkeypatch.setattr(svc, "ensure_company_master_populated", populated)

    await svc._refresh_broad(session)
    assert "refresh-rbi" in await _urls(session)
