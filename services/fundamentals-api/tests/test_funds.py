"""Offline tests for the mutual fund routes (service monkeypatched, same pattern
as test_ipos.py) and the pure ingest row validation. No network, no real DB.
"""

from datetime import date
from typing import ClassVar

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.api.routes import funds as routes
from app.main import app
from app.services import mf_ingest, mf_query

SUMMARY = {
    "scheme_code": 122639, "name": "PP Flexi Cap - Direct - Growth", "base_name": "PP Flexi Cap",
    "fund_house": "PPFAS Mutual Fund", "category": "Equity", "sub_category": "Flexi Cap Fund",
    "plan": "direct", "option": "growth", "nav": 85.12, "nav_date": date(2026, 11, 17),
    "ret_1m": 1.0, "ret_3m": 2.0, "ret_6m": 3.0, "ret_1y": 12.0, "ret_3y": 18.0, "ret_5y": 20.0,
    "ret_10y": None, "std_dev_3y": 10.0, "sharpe_3y": 1.1, "sortino_3y": 1.6,
    "max_drawdown_3y": -9.0, "sip_xirr_3y": 15.0, "sip_xirr_5y": 17.0,
    "expense_ratio": 0.63, "aum_cr": 90000.0,
}


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_list_funds_passes_filters_and_returns_shape(client, monkeypatch):
    seen = {}

    async def fake(session, f):
        seen["f"] = f
        return {"total": 1, "limit": f.limit, "offset": f.offset, "items": [SUMMARY]}

    monkeypatch.setattr(mf_query, "list_funds", fake)
    r = client.get("/funds?category=Equity&min_ret_3y=15&sort=sharpe_3y&order=asc&limit=10")
    assert r.status_code == 200
    assert r.json()["items"][0]["scheme_code"] == 122639
    f = seen["f"]
    assert (f.category, f.min_ret_3y, f.sort, f.order, f.limit) == ("Equity", 15.0, "sharpe_3y", "asc", 10)
    assert (f.plan, f.option) == ("direct", "growth")  # defaults


@pytest.mark.parametrize("qs", ["sort=name;drop", "limit=0", "limit=500", "plan=bogus", "min_ret_3y=abc"])
def test_list_funds_rejects_bad_input(client, qs):
    assert client.get(f"/funds?{qs}").status_code == 422


def test_get_fund_404(client, monkeypatch):
    async def none(session, code):
        return None

    monkeypatch.setattr(mf_query, "get_fund", none)
    assert client.get("/funds/1").status_code == 404


def test_get_fund_detail_shape(client, monkeypatch):
    async def fake(session, code):
        return {**SUMMARY, "scheme_type": "open_ended", "isin_growth": "INF1", "isin_reinvest": None,
                "is_active": True, "metrics_as_of": date(2026, 11, 17), "factsheet": None}

    monkeypatch.setattr(mf_query, "get_fund", fake)
    body = client.get("/funds/122639").json()
    assert body["factsheet"] is None and body["scheme_type"] == "open_ended"


def test_nav_range_validated(client, monkeypatch):
    async def fake(session, code, rng):
        return [{"date": date(2026, 11, 17), "nav": 10.0}]

    monkeypatch.setattr(mf_query, "get_nav_history", fake)
    assert client.get("/funds/1/nav?range=5y").json() == [{"date": "2026-11-17", "nav": 10.0}]
    assert client.get("/funds/1/nav?range=forever").status_code == 422


def test_facets_not_shadowed_by_scheme_code_route(client, monkeypatch):
    async def fake(session):
        return {"categories": ["Equity"], "sub_categories": {"Equity": ["Flexi Cap Fund"]},
                "fund_houses": ["PPFAS Mutual Fund"], "nav_as_of": None}

    monkeypatch.setattr(mf_query, "get_facets", fake)
    assert client.get("/funds/facets").json()["categories"] == ["Equity"]


class TestIngestAuth:
    ROUTES: ClassVar = [
        ("/funds/ingest/schemes", {"rows": []}),
        ("/funds/ingest/nav", {"scheme_code": 1, "points": []}),
        ("/funds/ingest/metrics", {"scheme_codes": [1]}),
        ("/funds/ingest/factsheet", {"rows": []}),
        ("/funds/ingest/ter", {"rows": [], "as_of": "2026-11-18"}),
    ]

    @pytest.mark.parametrize(("path", "body"), ROUTES)
    def test_refused_when_token_unconfigured(self, client, path, body):
        assert client.post(path, json=body).status_code == 503

    @pytest.mark.parametrize(("path", "body"), ROUTES)
    def test_wrong_token_is_401(self, client, monkeypatch, path, body):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        assert client.post(path, json=body, headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_valid_token_reaches_service(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")

        async def fake(session, codes):
            return {"computed": len(codes), "requested": len(codes)}

        monkeypatch.setattr(mf_ingest, "recompute_metrics", fake)
        r = client.post("/funds/ingest/metrics", json={"scheme_codes": [1, 2]},
                        headers={"Authorization": "Bearer secret"})
        assert r.status_code == 200 and r.json()["computed"] == 2

    def test_oversized_batch_rejected(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        r = client.post("/funds/ingest/metrics", json={"scheme_codes": list(range(201))},
                        headers={"Authorization": "Bearer secret"})
        assert r.status_code == 422


class TestSchemeValues:
    ROW: ClassVar = {"scheme_code": "100", "name": "X", "fund_house": "Y", "latest_nav": 10.0,
           "latest_nav_date": "2026-11-17"}

    def test_active_when_nav_recent(self):
        v = mf_ingest.scheme_values(self.ROW, newest=date(2026, 11, 17))
        assert v["scheme_code"] == 100 and v["is_active"] is True

    def test_dormant_when_nav_stale(self):
        v = mf_ingest.scheme_values({**self.ROW, "latest_nav_date": "2018-07-02"}, newest=date(2026, 11, 17))
        assert v["is_active"] is False

    def test_inactive_when_nav_missing(self):
        v = mf_ingest.scheme_values({**self.ROW, "latest_nav": None}, newest=date(2026, 11, 17))
        assert v["is_active"] is False

    @pytest.mark.parametrize("bad", [{"scheme_code": "abc"}, {"name": ""}, {"fund_house": None}])
    def test_unusable_rows_dropped(self, bad):
        assert mf_ingest.scheme_values({**self.ROW, **bad}, newest=None) is None


def test_queue_routes_need_token(client):
    assert client.get("/funds/ingest/backfill-queue").status_code == 503
    assert client.get("/funds/ingest/metrics-queue").status_code == 503


class TestInputBounds:
    @pytest.mark.parametrize("path", [
        "/funds/99999999999", "/funds/99999999999/nav", "/funds/99999999999/peers", "/funds/0",
    ])
    def test_out_of_range_scheme_code_is_422_not_500(self, client, path):
        assert client.get(path).status_code == 422

    def test_ingest_bodies_bound_scheme_codes(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        auth = {"Authorization": "Bearer secret"}
        assert client.post("/funds/ingest/nav", json={"scheme_code": 99999999999, "points": []},
                           headers=auth).status_code == 422
        assert client.post("/funds/ingest/metrics", json={"scheme_codes": [99999999999]},
                           headers=auth).status_code == 422
        assert client.get("/funds/ingest/metrics-queue?after=99999999999", headers=auth).status_code == 422


class TestIngestGate:
    """Auth and size are decided from headers, before the body is parsed."""

    def test_unauthenticated_oversized_body_is_refused_without_parsing(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        r = client.post("/funds/ingest/nav", content=b"{" + b" " * (3 * 1024 * 1024),
                        headers={"Content-Type": "application/json"})
        assert r.status_code == 401  # auth first, so no 413/422 detail for strangers

    def test_authenticated_oversized_body_is_413(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        r = client.post("/funds/ingest/nav", content=b"{" + b" " * (3 * 1024 * 1024),
                        headers={"Content-Type": "application/json", "Authorization": "Bearer secret"})
        assert r.status_code == 413

    def test_bad_json_with_wrong_token_does_not_echo_validation_detail(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        r = client.post("/funds/ingest/schemes", json={"rows": "nope"})
        assert r.status_code == 401 and "rows" not in r.text

    def test_unconfigured_token_is_503_before_parsing(self, client):
        assert client.post("/funds/ingest/schemes", json={"rows": "nope"}).status_code == 503


class TestTerIngestRoute:
    AUTH: ClassVar = {"Authorization": "Bearer secret"}

    def test_too_few_rows_is_422_not_a_wipe(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")

        async def fake(session, rows, as_of):
            return {"error": "refusing 1 TER rows (expected at least 500)"}

        monkeypatch.setattr(mf_ingest, "ingest_ter", fake)
        r = client.post("/funds/ingest/ter", json={"rows": [{"name": "X", "regular": 1.0}], "as_of": "2026-11-18"},
                        headers=self.AUTH)
        assert r.status_code == 422 and "refusing" in r.json()["detail"]

    def test_valid_request_reaches_service_with_typed_rows(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        seen = {}

        async def fake(session, rows, as_of):
            seen["rows"], seen["as_of"] = rows, as_of
            return {"matched_rows": 1}

        monkeypatch.setattr(mf_ingest, "ingest_ter", fake)
        r = client.post("/funds/ingest/ter",
                        json={"rows": [{"name": "Alpha Fund", "regular": 1.5, "direct": 0.5}], "as_of": "2026-11-18"},
                        headers=self.AUTH)
        assert r.status_code == 200
        assert seen["rows"][0].name == "Alpha Fund" and seen["rows"][0].direct == 0.5
        assert seen["as_of"] == date(2026, 11, 18)

    @pytest.mark.parametrize("row", [{"name": "A", "regular": 0}, {"name": "A", "direct": 11}, {"name": "", "regular": 1}])
    def test_out_of_range_rows_rejected(self, client, monkeypatch, row):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        r = client.post("/funds/ingest/ter", json={"rows": [row], "as_of": "2026-11-18"}, headers=self.AUTH)
        assert r.status_code == 422


class TestBackfillQueueParams:
    AUTH: ClassVar = {"Authorization": "Bearer secret"}

    def test_category_and_cursor_reach_the_service(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        seen = {}

        async def fake(session, limit, *, category=None, after=0):
            seen.update(limit=limit, category=category, after=after)
            return [11, 12]

        monkeypatch.setattr(mf_ingest, "backfill_queue", fake)
        r = client.get("/funds/ingest/backfill-queue?limit=50&category=Equity&after=10", headers=self.AUTH)
        assert r.status_code == 200 and r.json() == {"scheme_codes": [11, 12]}
        assert seen == {"limit": 50, "category": "Equity", "after": 10}

    def test_defaults_are_no_category_and_cursor_zero(self, client, monkeypatch):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        seen = {}

        async def fake(session, limit, *, category=None, after=0):
            seen.update(category=category, after=after)
            return []

        monkeypatch.setattr(mf_ingest, "backfill_queue", fake)
        client.get("/funds/ingest/backfill-queue", headers=self.AUTH)
        assert seen == {"category": None, "after": 0}

    @pytest.mark.parametrize("qs", ["after=-1", "after=99999999999", "category=" + "x" * 40])
    def test_bad_values_are_422(self, client, monkeypatch, qs):
        monkeypatch.setattr(routes._settings, "mf_ingest_token", "secret")
        assert client.get(f"/funds/ingest/backfill-queue?{qs}", headers=self.AUTH).status_code == 422
