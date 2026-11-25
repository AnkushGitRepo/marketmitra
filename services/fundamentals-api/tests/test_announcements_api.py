"""The announcements and insights endpoints (#365): response shape, category filter, limit, validation."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.db.models import CompanyAnnouncementORM, CompanyInsightORM, CompanyORM
from app.main import app


async def _fake_resolve_company(symbol: str, _session=None):
    return CompanyORM(id=1, nse_symbol=symbol, name="Newgen Software Technologies Limited")


def _ann(title: str, category: str, day: int | None) -> CompanyAnnouncementORM:
    return CompanyAnnouncementORM(
        id=day or 0, company_id=1, announced_on=date(2026, 9, day) if day else None, title=title, summary=None,
        category=category, url=f"https://example.test/{title}", source_tier="tier3_screener", fetched_at=datetime.now(UTC),
    )


@pytest.fixture
def client(monkeypatch):
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    monkeypatch.setattr("app.api.routes.announcements.resolve_company", _fake_resolve_company)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _stub(monkeypatch, rows):
    seen = {}

    async def fake(_session, _company, limit=50):
        seen["limit"] = limit
        return rows

    monkeypatch.setattr("app.api.routes.announcements.svc.get_announcements", fake)
    return seen


def test_announcements_are_returned_with_their_category(client, monkeypatch):
    _stub(monkeypatch, [_ann("Credit Rating", "credit_rating", 3), _ann("Court order", "litigation", 2)])
    body = client.get("/companies/NEWGEN/announcements").json()
    assert [(a["title"], a["category"], a["announced_on"]) for a in body] == [
        ("Credit Rating", "credit_rating", "2026-09-03"),
        ("Court order", "litigation", "2026-09-02"),
    ]
    assert set(body[0]) == {"announced_on", "title", "summary", "category", "url", "source_tier"}


def test_category_filter_returns_only_that_category(client, monkeypatch):
    _stub(monkeypatch, [_ann("Credit Rating", "credit_rating", 3), _ann("Court order", "litigation", 2), _ann("Tribunal notice", "litigation", None)])
    body = client.get("/companies/NEWGEN/announcements?category=litigation").json()
    assert [a["title"] for a in body] == ["Court order", "Tribunal notice"]


def test_an_unknown_category_is_ignored_not_an_error(client, monkeypatch):
    _stub(monkeypatch, [_ann("Credit Rating", "credit_rating", 3)])
    assert len(client.get("/companies/NEWGEN/announcements?category=nonsense").json()) == 1


def test_limit_is_applied_after_the_filter_and_validated(client, monkeypatch):
    rows = [_ann(f"Order {i}", "litigation", i) for i in range(1, 6)]
    seen = _stub(monkeypatch, rows)
    assert len(client.get("/companies/NEWGEN/announcements?category=litigation&limit=2").json()) == 2
    assert seen["limit"] == 200  # the full window is read, so a filtered query still finds older rows
    assert client.get("/companies/NEWGEN/announcements?limit=0").status_code == 422
    assert client.get("/companies/NEWGEN/announcements?limit=500").status_code == 422


def test_insights_are_returned_as_pros_and_cons(client, monkeypatch):
    async def fake(_session, _company):
        return [
            CompanyInsightORM(id=1, company_id=1, kind="pro", text="Company is almost debt free.", source_tier="tier3_screener"),
            CompanyInsightORM(id=2, company_id=1, kind="con", text="Company has high debtors of 164 days.", source_tier="tier3_screener"),
        ]

    monkeypatch.setattr("app.api.routes.announcements.svc.get_insights", fake)
    body = client.get("/companies/NEWGEN/insights").json()
    assert [(i["kind"], i["text"]) for i in body] == [
        ("pro", "Company is almost debt free."),
        ("con", "Company has high debtors of 164 days."),
    ]


def test_the_ratios_statement_type_is_accepted_by_the_financials_route(client, monkeypatch):
    async def fake(_session, _company, statement_type):
        assert statement_type.value == "ratios"
        return []

    monkeypatch.setattr("app.api.routes.financials.resolve_company", _fake_resolve_company)
    monkeypatch.setattr("app.api.routes.financials.svc.get_financial_statement", fake)
    assert client.get("/companies/NEWGEN/financials/ratios").status_code == 200
    assert client.get("/companies/NEWGEN/financials/nonsense").status_code == 422
