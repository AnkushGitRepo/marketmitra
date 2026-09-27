"""get_price_history's period handling.

Previously, `/companies/{symbol}/prices?period=` ingested whatever range
first happened to trigger a cache fill for a company, and the read path
never filtered by period at all — every one of 1mo/6mo/1y/5y read back the
exact same unfiltered rows from Postgres, so the stock page's range tabs
only relabeled the chart's x-axis without ever changing the plotted series.
"""

from datetime import UTC, date, datetime, timedelta

import pytest

from app.db.models import CompanyORM, PriceHistoryPointORM
from app.services import fundamentals_service as svc


class _Scalar:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _Scalars:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return iter(self._rows)


class _FakeSession:
    """Queues one canned result per `execute()` call, in order — the same
    convention `test_fundamentals_service.py` already uses."""

    def __init__(self, responses):
        self._responses = list(responses)

    async def execute(self, _stmt):
        return self._responses.pop(0)

    async def commit(self):
        pass


@pytest.mark.parametrize(
    ("period", "expected_days_back"),
    [
        ("1mo", 30),
        ("6mo", 182),
        ("1y", 365),
        ("5y", 365 * 5),
    ],
)
def test_price_period_cutoff_maps_known_periods(period, expected_days_back):
    today = date(2026, 9, 27)
    assert svc.price_period_cutoff(period, today) == today - timedelta(days=expected_days_back)


def test_price_period_cutoff_falls_back_to_1y_for_an_unknown_period():
    today = date(2026, 9, 27)
    assert svc.price_period_cutoff("nonsense", today) == svc.price_period_cutoff("1y", today)


@pytest.mark.asyncio
async def test_get_price_history_ingests_at_full_width_regardless_of_requested_period(monkeypatch):
    """A caller asking for just '1mo' must not narrow what gets fetched
    from yfinance and cached — otherwise every other period reads back
    only that same narrow slice until the cache TTL next expires."""
    captured_period = {}

    async def fake_yfinance_history(nse_symbol, bse_code, period):
        captured_period["value"] = period
        return []

    monkeypatch.setattr(svc.tier2_yfinance, "get_price_history", fake_yfinance_history)

    company = CompanyORM(id=1, nse_symbol="HDFCBANK", name="HDFC Bank Limited")
    session = _FakeSession(
        [
            _Scalar(None),  # no cached row yet -> forces an ingest
            _Scalars([]),  # final filtered read, empty is fine for this test
        ]
    )

    await svc.get_price_history(session, company, period="1mo")

    assert captured_period["value"] == svc._PRICE_INGEST_PERIOD
    assert captured_period["value"] != "1mo"


@pytest.mark.asyncio
async def test_get_price_history_skips_ingest_when_cache_is_warm(monkeypatch):
    calls = []

    async def fake_yfinance_history(*_a, **_k):
        calls.append(1)
        return []

    monkeypatch.setattr(svc.tier2_yfinance, "get_price_history", fake_yfinance_history)

    company = CompanyORM(id=1, nse_symbol="HDFCBANK", name="HDFC Bank Limited")
    recent_point = PriceHistoryPointORM(
        id=1, company_id=1, exchange="NSE", trade_date=date.today(), fetched_at=datetime.now(UTC)
    )
    session = _FakeSession(
        [
            _Scalar(recent_point),  # cache is warm -> no ingest
            _Scalars([recent_point]),  # final filtered read
        ]
    )

    result = await svc.get_price_history(session, company, period="1y")

    assert calls == []
    assert result == [recent_point]
