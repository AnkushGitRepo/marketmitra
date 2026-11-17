from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.db.models import CompanyORM, RatioORM
from app.main import app


async def _fake_resolve_company(symbol: str, _session=None):
    return CompanyORM(
        id=1,
        nse_symbol=symbol,
        name="Reliance Industries Limited",
        industry="Oil & Gas Refining & Marketing",
        sector="Energy",
        source_tier="tier2_yfinance",
    )


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_company(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.companies.resolve_company", _fake_resolve_company)

    async def fake_get_about(session, company):
        return "Reliance Industries is a diversified conglomerate."

    monkeypatch.setattr("app.api.routes.companies.svc.get_about", fake_get_about)

    async def not_sme(session, symbol):
        return (False, "Reliance Industries Limited")

    monkeypatch.setattr("app.api.routes.companies.master_info", not_sme)

    response = client.get("/companies/RELIANCE")
    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "RELIANCE"
    assert body["name"] == "Reliance Industries Limited"
    assert body["source_tier"] == "tier2_yfinance"
    assert body["about"] == "Reliance Industries is a diversified conglomerate."
    assert body["is_sme"] is False


def test_get_company_ratios_includes_source_tier(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.companies.resolve_company", _fake_resolve_company)

    async def fake_get_ratios(session, company):
        return [
            RatioORM(
                company_id=1,
                name="Stock P/E",
                value=Decimal("24.0"),
                unit=None,
                as_of=date.today(),
                source_tier="tier3_screener",
            )
        ]

    monkeypatch.setattr("app.api.routes.companies.svc.get_ratios", fake_get_ratios)

    response = client.get("/companies/RELIANCE/ratios")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Stock P/E"
    assert body[0]["source_tier"] == "tier3_screener"


def test_get_company_peers_includes_target_flag(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.companies.resolve_company", _fake_resolve_company)

    async def fake_get_peers(session, company):
        from app.db.models import PeerComparisonORM

        return [
            PeerComparisonORM(
                company_id=1,
                peer_symbol="RELIANCE",
                peer_name="Reliance Industries Limited",
                is_target=True,
                cmp=Decimal("1322.0"),
                pe=Decimal("21.8"),
                market_cap=Decimal("900000"),
                div_yield=None,
                net_profit_qtr=None,
                qtr_profit_var_pct=None,
                sales_qtr=None,
                qtr_sales_var_pct=None,
                roce_pct=None,
                as_of=date.today(),
                source_tier="tier3_screener",
            )
        ]

    monkeypatch.setattr("app.api.routes.companies.svc.get_peers", fake_get_peers)

    response = client.get("/companies/RELIANCE/peers")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["symbol"] == "RELIANCE"
    assert body[0]["is_target"] is True


def test_invalid_statement_type_returns_422(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.financials.resolve_company", _fake_resolve_company)

    response = client.get("/companies/RELIANCE/financials/not_a_real_statement")
    assert response.status_code == 422
