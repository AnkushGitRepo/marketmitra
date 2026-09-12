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
    async def fake_query(session, filters):
        return [_fake_row()]

    monkeypatch.setattr("app.api.routes.screener.svc.query_screener_metrics", fake_query)
    res = client.get("/screener?pe_max=20&sector=Information+Technology")
    assert res.status_code == 200
    body = res.json()
    assert body[0]["symbol"] == "TESTA"
    assert body[0]["pe"] == 15.0
    assert body[0]["fetch_status"] == "ok"


def test_get_screener_facets_route_shape(client, monkeypatch):
    async def fake_facets(session):
        return {"sectors": ["Banking", "Information Technology"], "industries": ["IT Services"]}

    monkeypatch.setattr("app.api.routes.screener.svc.get_screener_facets", fake_facets)
    res = client.get("/screener/facets")
    assert res.status_code == 200
    assert res.json() == {"sectors": ["Banking", "Information Technology"], "industries": ["IT Services"]}


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
