"""Offline tests for GET /quote and the ingestion.quotes helpers — NSE/BSE
calls are monkeypatched, nothing hits the network. yfinance has been removed
from this path entirely (ADR 0024); these tests assert NSE-first, BSE-second
(when a bse_code is known), and no price at all when both come up short —
never a yfinance call.
"""

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.ingestion import quotes
from app.main import app


@pytest.fixture(autouse=True)
def _clear_quote_cache():
    quotes._clear_cache()
    yield
    quotes._clear_cache()


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _fake_nse_quote(**overrides):
    base = {
        "last_price": 1400.0,
        "prev_close": 1350.0,
        "day_high": 1420.0,
        "day_low": 1390.0,
        "week52_high": 1600.0,
        "week52_low": 1100.0,
    }
    base.update(overrides)
    return base


def test_quote_batch_shapes_and_change_pct(client, monkeypatch):
    calls: list[str] = []

    async def fake_nse(symbol: str) -> dict:
        calls.append(symbol)
        return _fake_nse_quote()

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)

    response = client.get("/quote", params={"symbols": "RELIANCE,TCS"})
    assert response.status_code == 200
    body = response.json()
    assert [q["symbol"] for q in body] == ["RELIANCE", "TCS"]
    assert calls == ["RELIANCE", "TCS"]

    first = body[0]
    assert first["price"] == "1400.0"
    assert first["prev_close"] == "1350.0"
    # (1400 - 1350) / 1350 * 100
    assert first["change_pct"].startswith("3.7037")
    assert first["week52_high"] == "1600.0"
    assert first["week52_low"] == "1100.0"
    assert first["source_tier"] == "tier1_nse_bse"
    assert first["as_of"].endswith("+00:00")


def test_quote_falls_back_to_bse_when_nse_empty_and_code_known(client, monkeypatch):
    async def fake_nse(symbol: str) -> dict:
        return {}

    bse_calls: list[str] = []

    async def fake_bse(bse_code: str) -> dict:
        bse_calls.append(bse_code)
        return _fake_nse_quote(last_price=999.0)

    async def fake_bse_code(symbol: str, session) -> str | None:
        return "500325"

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)
    monkeypatch.setattr(quotes.tier1_nse_bse, "get_bse_quote", fake_bse)
    monkeypatch.setattr(quotes, "_get_bse_code", fake_bse_code)

    response = client.get("/quote", params={"symbols": "RELIANCE"})
    assert response.status_code == 200
    body = response.json()
    assert bse_calls == ["500325"]
    assert body[0]["price"] == "999.0"
    assert body[0]["source_tier"] == "tier1_nse_bse"


def test_quote_returns_nothing_when_nse_and_bse_both_empty(client, monkeypatch):
    async def fake_nse(symbol: str) -> dict:
        return {}

    async def fake_bse_code(symbol: str, session) -> str | None:
        return None

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)
    monkeypatch.setattr(quotes, "_get_bse_code", fake_bse_code)

    response = client.get("/quote", params={"symbols": "UNKNOWNCO"})
    assert response.status_code == 200
    assert response.json() == []


def test_quotes_module_has_no_yfinance_dependency():
    import ast
    import inspect

    source = inspect.getsource(quotes)
    tree = ast.parse(source)
    imported_names = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }
    assert "yfinance" not in imported_names


def test_quote_dedupes_and_is_cached(client, monkeypatch):
    calls: list[str] = []

    async def fake_nse(symbol: str) -> dict:
        calls.append(symbol)
        return _fake_nse_quote()

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)

    client.get("/quote", params={"symbols": "RELIANCE,reliance , RELIANCE"})
    client.get("/quote", params={"symbols": "RELIANCE"})

    # Deduped within the first request, and the TTL cache absorbs the second.
    assert calls == ["RELIANCE"]


def test_quote_skips_failed_and_priceless_symbols(client, monkeypatch):
    async def fake_nse(symbol: str) -> dict:
        if symbol == "BOOM":
            raise RuntimeError("upstream 503")
        if symbol == "NOPRICE":
            return {}
        return _fake_nse_quote()

    async def fake_bse_code(symbol: str, session) -> str | None:
        return None

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)
    monkeypatch.setattr(quotes, "_get_bse_code", fake_bse_code)

    response = client.get("/quote", params={"symbols": "RELIANCE,BOOM,NOPRICE"})
    assert response.status_code == 200
    assert [q["symbol"] for q in response.json()] == ["RELIANCE"]


def test_quote_missing_prev_close_gives_null_change_pct(client, monkeypatch):
    async def fake_nse(symbol: str) -> dict:
        return _fake_nse_quote(prev_close=None)

    monkeypatch.setattr(quotes.tier1_nse_bse, "get_nse_quote", fake_nse)

    response = client.get("/quote", params={"symbols": "RELIANCE"})
    assert response.status_code == 200
    body = response.json()[0]
    assert body["prev_close"] is None
    assert body["change_pct"] is None


def test_quote_requires_symbols_param(client):
    assert client.get("/quote").status_code == 422
    assert client.get("/quote", params={"symbols": " , "}).json() == []
