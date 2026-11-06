"""Offline tests for the Screener feature (ADR 0025): the /screener route
shapes (service monkeypatched, same pattern as test_ipos.py) and
screener_service's pure row-mapping logic. No network, no real DB.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.services import screener_service as svc


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _fake_row(**overrides):
    base = {
        "symbol": "TESTA",
        "name": "Test Alpha Ltd",
        "sector": "Information Technology",
        "industry": "IT Services",
        "market_cap": 5000.0,
        "current_price": 100.0,
        "pe": 15.0,
        "book_value": 50.0,
        "pb": 2.0,
        "dividend_yield": 1.5,
        "roce": 20.0,
        "roe": 18.0,
        "face_value": 10.0,
        "debt_to_equity": 0.1,
        "sales_growth_3y_cagr": 0.12,
        "profit_growth_3y_cagr": 0.15,
        "fetch_status": "ok",
        "source_tier": "tier3_screener_bulk",
        "fetched_at": datetime(2026, 9, 13, 2, 0, tzinfo=UTC),
    }
    base.update(overrides)
    return type("Row", (), base)()  # attribute access, like an ORM row


def test_get_screener_route_shape(client, monkeypatch):
    seen = {}

    async def fake_query(session, filters):
        seen.update(filters)
        return [_fake_row()]

    async def fake_count(session, filters):
        return 137

    monkeypatch.setattr("app.api.routes.screener.svc.query_screener_metrics", fake_query)
    monkeypatch.setattr("app.api.routes.screener.svc.count_screener_metrics", fake_count)
    res = client.get("/screener?pe_max=20&sector=Information+Technology&q=tcs&offset=50&limit=25")
    assert res.status_code == 200
    assert res.headers["x-total-count"] == "137"
    assert (seen["q"], seen["offset"], seen["limit"]) == ("tcs", 50, 25)
    body = res.json()
    assert body[0]["symbol"] == "TESTA"
    assert body[0]["pe"] == 15.0
    assert body[0]["fetch_status"] == "ok"


def test_get_screener_facets_route_shape(client, monkeypatch):
    seen = {}

    async def fake_facets(session, sector=None):
        seen["sector"] = sector
        return {"sectors": ["Banking", "Information Technology"], "industries": ["IT Services"]}

    monkeypatch.setattr("app.api.routes.screener.svc.get_screener_facets", fake_facets)
    res = client.get("/screener/facets?sector=Information+Technology")
    assert res.status_code == 200
    assert res.json()["industries"] == ["IT Services"]
    assert seen["sector"] == "Information Technology"


def test_screener_ingest_requires_token(client):
    # screener_ingest_token is unset in tests -> 503
    assert client.post("/screener/ingest", json={"rows": []}).status_code == 503


def test_screener_ingest_token_matrix(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.screener._settings.screener_ingest_token", "s3cret")

    async def fake_ingest(session, rows):
        return {"ingested": len(rows)}

    monkeypatch.setattr("app.api.routes.screener.svc.ingest_screener_metrics", fake_ingest)

    assert client.post("/screener/ingest", json={"rows": []}).status_code == 401
    assert client.post(
        "/screener/ingest", json={"rows": []}, headers={"Authorization": "Bearer nope"}
    ).status_code == 401
    ok = client.post(
        "/screener/ingest",
        json={"rows": [{"symbol": "x", "name": "X"}]},
        headers={"Authorization": "Bearer s3cret"},
    )
    assert ok.status_code == 200
    assert ok.json()["ingested"] == 1


class TestRowToValues:
    def test_uppercases_symbol_and_fills_defaults(self):
        values = svc._row_to_values({"symbol": "testa", "name": "Test Alpha", "pe": 15.0})
        assert values["symbol"] == "TESTA"
        assert values["fetch_status"] == "ok"
        assert values["source_tier"] == "tier3_screener_bulk"
        assert values["pe"] == 15.0

    def test_drops_rows_without_symbol_or_name(self):
        assert svc._row_to_values({"name": "No Symbol"}) is None
        assert svc._row_to_values({"symbol": "NONAME"}) is None

    def test_ignores_unknown_keys(self):
        values = svc._row_to_values({"symbol": "TESTA", "name": "Test Alpha", "made_up_field": 1})
        assert "made_up_field" not in values


def test_quotes_and_stale_require_token(client):
    assert client.post("/screener/quotes", json={"rows": []}).status_code == 503
    assert client.get("/screener/stale").status_code == 503


def test_quotes_and_stale_token_matrix(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.screener._settings.screener_ingest_token", "s3cret")
    seen = {}

    async def fake_quotes(session, rows):
        seen["rows"] = rows
        return {"ingested": len(rows), "skipped": 0}

    async def fake_stale(session, limit):
        seen["limit"] = limit
        return [{"symbol": "TCS", "name": "Tata Consultancy Services Limited"}]

    monkeypatch.setattr("app.api.routes.screener.svc.ingest_quotes", fake_quotes)
    monkeypatch.setattr("app.api.routes.screener.svc.stale_symbols", fake_stale)
    auth = {"Authorization": "Bearer s3cret"}

    assert client.post("/screener/quotes", json={"rows": []}).status_code == 401
    assert client.get("/screener/stale", headers={"Authorization": "Bearer nope"}).status_code == 401

    ok = client.post("/screener/quotes", json={"rows": [{"symbol": "TCS", "pe": 25}]}, headers=auth)
    assert ok.status_code == 200 and ok.json()["ingested"] == 1
    stale = client.get("/screener/stale?limit=50", headers=auth)
    assert stale.json()[0]["symbol"] == "TCS" and seen["limit"] == 50


def test_stale_limit_is_bounded(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.screener._settings.screener_ingest_token", "s3cret")
    response = client.get("/screener/stale?limit=999999", headers={"Authorization": "Bearer s3cret"})
    assert response.status_code == 422


def test_fundamentals_ingest_stamps_freshness():
    values = svc._row_to_values({"symbol": "tcs", "name": "TCS", "roe": 50})
    assert values["symbol"] == "TCS"
    assert values["fundamentals_updated_at"] == values["fetched_at"]


def test_sort_by_is_allow_listed():
    from app.db.models import ScreenerMetricsORM

    clause = svc._order_by({"sort_by": "roe", "order": "asc"})[0]
    assert "roe" in str(clause) and "ASC" in str(clause) and "NULLS LAST" in str(clause)
    # Unknown / injected column names fall back to the market-cap default.
    fallback = svc._order_by({"sort_by": "symbol; DROP TABLE x"})
    assert str(fallback[0]) == str(ScreenerMetricsORM.market_cap.desc().nullslast())


def test_stats_route_shape(client, monkeypatch):
    async def fake_stats(session):
        return {"universe": 2400, "with_quotes": 2300, "with_fundamentals": 400,
                "quotes_updated_at": None, "fundamentals_updated_at": None}

    monkeypatch.setattr("app.api.routes.screener.svc.get_screener_stats", fake_stats)
    body = client.get("/screener/stats").json()
    assert body["with_fundamentals"] == 400


def test_offset_and_limit_are_bounded(client):
    assert client.get("/screener?offset=-1").status_code == 422
    assert client.get("/screener?limit=501").status_code == 422


def test_like_pattern_escapes_wildcards():
    assert svc._escape_like("50%_off\\") == "50\\%\\_off\\\\"
