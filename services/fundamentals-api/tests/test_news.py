"""Offline tests for news ingestion + the /news route. feedparser is fed
fixture strings (it parses a string the same as a URL); no network, no DB.
"""

import feedparser
import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.ingestion import news
from app.main import app
from app.services import news_service

BROAD_RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>ET Markets</title>
  <item>
    <title>Reliance Industries surges 4% on strong Q2 results</title>
    <link>https://example.com/reliance-q2</link>
    <description>&lt;p&gt;The stock rallied after profit beat estimates.&lt;/p&gt;</description>
    <pubDate>Mon, 01 Sep 2025 08:30:00 GMT</pubDate>
  </item>
  <item>
    <title>Market falls sharply as global cues weaken</title>
    <link>https://example.com/market-fall</link>
    <description>Sensex and Nifty end deep in the red.</description>
    <pubDate>Mon, 01 Sep 2025 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>No link here</title>
    <description>should be dropped</description>
  </item>
</channel></rss>
"""

GOOGLE_RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>"Tata Consultancy Services" NSE - Google News</title>
  <item>
    <title>TCS wins large deal in Europe</title>
    <link>https://news.google.com/rss/articles/abc123</link>
    <description>TCS expands European footprint.</description>
    <pubDate>Tue, 02 Sep 2025 09:00:00 GMT</pubDate>
    <source url="https://www.livemint.com">Mint</source>
  </item>
</channel></rss>
"""


def parse_fixture(text: str):
    return list(feedparser.parse(text).entries)


# --- pure helpers ---------------------------------------------------------

class TestSentiment:
    def test_labels(self):
        assert news.score_sentiment("surges on strong profit beat, record high")[0] == "positive"
        assert news.score_sentiment("crashes, plunges on fraud probe and losses")[0] == "negative"
        assert news.score_sentiment("company files quarterly report with the exchange")[0] == "neutral"

    def test_score_is_rounded(self):
        _, score = news.score_sentiment("great results, shares jump")
        assert score == round(score, 4)


class TestNameMatching:
    def test_matcher_name_rejects_short_or_single_word(self):
        assert news.matcher_name("ITC Limited") is None          # 3 chars after strip
        assert news.matcher_name("MRF Ltd") is None
        assert news.matcher_name("Infosys Limited") is None       # single word

    def test_matcher_name_keeps_distinctive_multiword(self):
        assert news.matcher_name("Tata Consultancy Services Limited") == "Tata Consultancy Services"
        assert news.matcher_name("Reliance Industries Ltd.") == "Reliance Industries"

    def test_tag_symbols_word_boundary(self):
        index = [
            ("TCS", news.build_name_pattern("Tata Consultancy Services")),
            ("RELIANCE", news.build_name_pattern("Reliance Industries")),
        ]
        assert news.tag_symbols("Tata Consultancy Services wins a deal", index) == ["TCS"]
        assert news.tag_symbols("Reliance Industries and Tata Consultancy Services rally", index) == [
            "TCS",
            "RELIANCE",
        ]
        assert news.tag_symbols("Some unrelated market headline", index) == []


def test_google_news_url():
    url = news.google_news_rss_url("Reliance Industries Limited")
    assert url.startswith("https://news.google.com/rss/search?q=")
    assert "Reliance+Industries" in url and "NSE" in url and "ceid=IN:en" in url


# --- feed parsing (feedparser monkeypatched to read the fixtures) ---------

@pytest.mark.asyncio
async def test_fetch_broad_items(monkeypatch):
    monkeypatch.setattr(news, "_parse", lambda _url: parse_fixture(BROAD_RSS))
    items = await news.fetch_broad_items()
    # 2 valid items across each configured feed; the link-less one is dropped
    assert len(items) == 2 * len(news.BROAD_FEEDS)
    first = items[0]
    assert first["title"].startswith("Reliance Industries surges")
    assert first["url"] == "https://example.com/reliance-q2"
    assert first["summary"] == "The stock rallied after profit beat estimates."  # HTML stripped
    assert first["published_at"].year == 2025
    assert first["sentiment"] == "positive"
    assert first["source"] == "Economic Times Markets"


@pytest.mark.asyncio
async def test_fetch_symbol_items_uses_publisher_as_source(monkeypatch):
    monkeypatch.setattr(news, "_parse", lambda _url: parse_fixture(GOOGLE_RSS))
    items = await news.fetch_symbol_items("Tata Consultancy Services Limited")
    assert len(items) == 1
    assert items[0]["source"] == "Mint"
    assert items[0]["title"] == "TCS wins large deal in Europe"


@pytest.mark.asyncio
async def test_fetch_broad_items_skips_a_failing_feed(monkeypatch):
    def boom(_url):
        raise RuntimeError("feed 500")

    monkeypatch.setattr(news, "_parse", boom)
    assert await news.fetch_broad_items() == []


# --- service pure helpers ------------------------------------------------

class TestCursor:
    def test_roundtrip(self):
        from datetime import UTC, datetime

        pub = datetime(2025, 9, 1, 8, 30, tzinfo=UTC)
        cur = news_service._encode_cursor(pub, 42)
        assert news_service._decode_cursor(cur) == (pub, 42)

    def test_bad_cursor_is_none(self):
        assert news_service._decode_cursor(None) is None
        assert news_service._decode_cursor("not-base64!!") is None


class TestStaleness:
    def test_stale(self):
        from datetime import UTC, datetime, timedelta

        assert news_service._is_stale(None, 30) is True
        assert news_service._is_stale(datetime.now(UTC) - timedelta(minutes=45), 30) is True
        assert news_service._is_stale(datetime.now(UTC) - timedelta(minutes=5), 30) is False


# --- route (service monkeypatched) --------------------------------------

@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_news_route_shape(client, monkeypatch):
    from datetime import UTC, datetime

    async def fake_get_news(session, symbols=None, limit=20, cursor=None, include_regulatory=False):
        return {
            "items": [
                {
                    "url": "https://example.com/a",
                    "title": "Headline",
                    "summary": None,
                    "source": "Mint",
                    "published_at": datetime(2025, 9, 1, tzinfo=UTC),
                    "sentiment": "neutral",
                    "sentiment_score": 0.0,
                    "symbols": ["TCS"],
                }
            ],
            "next_cursor": "abc",
        }

    monkeypatch.setattr("app.api.routes.news.svc.get_news", fake_get_news)
    res = client.get("/news?symbols=TCS&limit=5")
    assert res.status_code == 200
    body = res.json()
    assert body["next_cursor"] == "abc"
    assert body["items"][0]["sentiment"] == "neutral"
    assert body["items"][0]["symbols"] == ["TCS"]


def test_news_route_rejects_bad_limit(client):
    assert client.get("/news?limit=999").status_code == 422


def test_news_route_leaves_regulator_notices_out_unless_asked(client, monkeypatch):
    seen = []

    async def fake_get_news(session, symbols=None, limit=20, cursor=None, include_regulatory=False):
        seen.append(include_regulatory)
        return {"items": [], "next_cursor": None}

    monkeypatch.setattr("app.api.routes.news.svc.get_news", fake_get_news)
    assert client.get("/news").status_code == 200
    assert client.get("/news?include_regulatory=true").status_code == 200
    assert seen == [False, True]
