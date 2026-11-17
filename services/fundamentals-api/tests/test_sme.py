"""SME stocks on the platform (issue #216, ADR 0066): the bundled SME symbol list,
the board filter that replaces the hard-coded main-board-only universe, and the
stalest-first blend that keeps SME from starving the main-board refresh."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.api import deps
from app.db.models import ScreenerMetricsORM
from app.ingestion import company_master as cm
from app.main import app
from app.services import screener_service as svc
from app.services.board import blend_stale, failure_rate_exceeded, resolve_board
from tests.test_screener import _fake_row


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


SYMBOL_LIST = "SYMBOL,SERIES\nANONDITA,SM\nhgsindialt,ST\nANONDITA,SM\n,SM\n"


class TestSymbolListParser:
    def test_builds_sme_rows_with_the_symbol_as_a_placeholder_name(self):
        rows = cm.parse_symbol_list(SYMBOL_LIST, is_sme=True)
        assert [r["symbol"] for r in rows] == ["ANONDITA", "HGSINDIALT"]
        assert rows[0] == {
            "symbol": "ANONDITA", "name": "ANONDITA", "isin": None, "series": "SM",
            "listing_date": None, "face_value": None, "is_sme": True,
        }

    def test_bundled_list_is_real_and_clean(self):
        rows = cm.parse_symbol_list(cm._bundled_text("SME_SYMBOLS.csv") or "", is_sme=True)
        assert len(rows) >= 500
        assert all(r["symbol"] == r["symbol"].upper() and r["series"] in {"SM", "ST"} for r in rows)

    def test_a_placeholder_name_is_recognised(self):
        assert cm.is_placeholder_name("ANONDITA", "ANONDITA")
        assert not cm.is_placeholder_name("ANONDITA", "Anondita Medicare Limited")


@pytest.mark.asyncio
class TestFetchLists:
    async def test_sme_falls_back_to_the_bundled_symbol_list_when_nse_is_unreachable(self, monkeypatch):
        async def nothing(url):
            return None

        monkeypatch.setattr(cm, "_fetch_text", nothing)
        rows = await cm.fetch_sme_list()
        assert len(rows) >= 500 and all(r["is_sme"] for r in rows)

    async def test_the_live_sme_file_wins_when_it_parses(self, monkeypatch):
        live = "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\nABC,Abc Ltd,SM,18-SEP-2012,10,300,INE000A01010,10\n"

        async def fake(url):
            return live

        monkeypatch.setattr(cm, "_fetch_text", fake)
        assert [r["name"] for r in await cm.fetch_sme_list()] == ["Abc Ltd"]

    async def test_a_symbol_on_both_lists_keeps_its_main_board_row(self, monkeypatch):
        main = "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\nTHEJO,Thejo Engineering Limited,EQ,18-SEP-2012,10,1,INE121N01019,10\n"
        sme = "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\nTHEJO,Thejo Engineering Limited,SM,18-SEP-2012,10,300,INE121N01019,10\n"

        async def fake(url):
            return main if url == cm.EQUITY_LIST_URL else sme

        monkeypatch.setattr(cm, "_fetch_text", fake)
        (row,) = await cm.fetch_equity_list()
        assert row["is_sme"] is False


class TestBetterName:
    def test_replaces_only_a_placeholder_with_a_real_name(self):
        assert cm.better_name("ANONDITA", "ANONDITA", " Anondita Medicare Limited ") == "Anondita Medicare Limited"

    def test_leaves_a_real_name_and_useless_candidates_alone(self):
        assert cm.better_name("ANONDITA", "Anondita Medicare Limited", "Another Name") is None
        assert cm.better_name("ANONDITA", "ANONDITA", None) is None
        assert cm.better_name("ANONDITA", "ANONDITA", "anondita") is None


class TestBoard:
    def test_defaults_to_the_main_board_so_existing_callers_are_unchanged(self):
        assert resolve_board(None, False) == "mainboard"

    def test_include_sme_is_an_alias_for_all(self):
        assert resolve_board(None, True) == "all"

    def test_an_explicit_board_wins_over_the_alias(self):
        assert resolve_board("sme", True) == "sme"
        assert resolve_board("mainboard", False) == "mainboard"

    def test_rejects_an_unknown_board(self):
        with pytest.raises(ValueError):
            resolve_board("nasdaq", False)


def _sql(filters: dict) -> str:
    stmt = svc._filtered(select(ScreenerMetricsORM.symbol), filters)
    return str(stmt.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))


class TestBoardFilter:
    def test_mainboard_and_sme_restrict_through_the_company_master(self):
        assert "company_master.is_sme IS false" in _sql({"board": "mainboard"})
        assert "company_master.is_sme IS true" in _sql({"board": "sme"})

    def test_all_adds_no_board_restriction(self):
        assert "company_master" not in _sql({"board": "all"})

    def test_a_missing_board_means_main_board(self):
        assert "company_master.is_sme IS false" in _sql({})


class TestFailureRate:
    def test_trips_only_above_the_threshold(self):
        assert failure_rate_exceeded(100, 21, 0.20)
        assert not failure_rate_exceeded(100, 20, 0.20)

    def test_an_sme_only_run_with_no_main_board_symbols_never_trips(self):
        assert not failure_rate_exceeded(0, 0, 0.20)


class TestUpsertSql:
    def test_sme_refresh_never_flips_a_main_board_row_or_overwrites_a_real_name(self):
        from app.services.search_service import _upsert

        rows = [{"symbol": "A", "name": "A", "isin": None, "series": "SM", "listing_date": None, "face_value": None, "is_sme": True}]
        sql = str(_upsert(rows, only_sme=True).compile(dialect=postgresql.dialect()))
        assert "WHERE company_master.is_sme IS true" in sql
        assert "CASE WHEN (excluded.name = excluded.symbol) THEN company_master.name ELSE excluded.name END" in sql
        assert "WHERE" not in str(_upsert(rows, only_sme=False).compile(dialect=postgresql.dialect())).split("DO UPDATE")[1]


class TestBlendStale:
    def test_caps_sme_to_its_share_so_main_board_keeps_refreshing(self):
        main = [{"symbol": f"M{i}", "is_sme": False} for i in range(10)]
        sme = [{"symbol": f"S{i}", "is_sme": True} for i in range(10)]
        out = blend_stale(main, sme, limit=8, sme_share=0.25)
        assert [r["is_sme"] for r in out].count(True) == 2
        assert len(out) == 8 and out[0]["symbol"] == "M0"

    def test_fills_with_sme_when_main_board_has_nothing_stale(self):
        sme = [{"symbol": f"S{i}", "is_sme": True} for i in range(10)]
        assert len(blend_stale([], sme, limit=8, sme_share=0.25)) == 8

    def test_fills_with_main_board_when_there_is_no_sme(self):
        main = [{"symbol": f"M{i}", "is_sme": False} for i in range(10)]
        assert len(blend_stale(main, [], limit=8, sme_share=0.25)) == 8

    def test_never_exceeds_the_limit_or_duplicates(self):
        main = [{"symbol": f"M{i}", "is_sme": False} for i in range(3)]
        sme = [{"symbol": f"S{i}", "is_sme": True} for i in range(3)]
        out = blend_stale(main, sme, limit=4, sme_share=0.5)
        assert len(out) == 4 and len({r["symbol"] for r in out}) == 4


class TestRoutes:
    def test_screener_route_defaults_to_main_board_and_reports_is_sme(self, client, monkeypatch):
        seen = {}

        async def fake_query(session, filters):
            seen.update(filters)
            return [(_fake_row(symbol="ANONDITA"), True)]

        async def fake_count(session, filters):
            return 1

        monkeypatch.setattr("app.api.routes.screener.svc.query_screener_metrics", fake_query)
        monkeypatch.setattr("app.api.routes.screener.svc.count_screener_metrics", fake_count)
        body = client.get("/screener").json()
        assert seen["board"] == "mainboard"
        assert body[0]["is_sme"] is True
        assert client.get("/screener?board=all").status_code == 200 and seen["board"] == "all"

    def test_screener_route_rejects_an_unknown_board(self, client):
        assert client.get("/screener?board=nasdaq").status_code == 422

    def test_stats_takes_a_board(self, client, monkeypatch):
        seen = {}

        async def fake_stats(session, board="mainboard"):
            seen["board"] = board
            return {"universe": 1, "by_board": {"mainboard": 1, "sme": 0}, "with_quotes": 0, "with_fundamentals": 0,
                    "quotes_updated_at": None, "fundamentals_updated_at": None}

        monkeypatch.setattr("app.api.routes.screener.svc.get_screener_stats", fake_stats)
        assert client.get("/screener/stats?board=sme").json()["by_board"]["sme"] == 0
        assert seen["board"] == "sme"


class _CountSession:
    """Answers `scalar()` with the queued counts (total, enriched, then SME rows)."""

    def __init__(self, *counts: int):
        self.counts = list(counts)
        self.asked = 0

    async def scalar(self, stmt):
        self.asked += 1
        return self.counts.pop(0)


@pytest.mark.asyncio
class TestSelfHealingSmeRows:
    @pytest.fixture(autouse=True)
    def _fresh_flag(self, monkeypatch):
        from app.services import search_service

        monkeypatch.setattr(search_service, "_sme_checked", False)
        self.calls = []

        async def fake_refresh(session, *, live=True):
            self.calls.append(live)
            return 568

        monkeypatch.setattr(search_service, "refresh_sme_master", fake_refresh)
        self.mod = search_service

    async def test_adds_the_sme_rows_once_when_a_populated_master_has_none(self):
        session = _CountSession(2630, 2630, 0)
        await self.mod.ensure_company_master_populated(session)
        assert self.calls == [False]  # bundled list only: a request never waits on NSE
        await self.mod.ensure_company_master_populated(_CountSession(2630, 2630))
        assert self.calls == [False]  # not asked again in this process

    async def test_leaves_a_master_that_already_has_sme_rows_alone(self):
        await self.mod.ensure_company_master_populated(_CountSession(3198, 3198, 568))
        assert self.calls == []


def test_company_route_reports_whether_it_is_an_sme(client, monkeypatch):
    from types import SimpleNamespace

    company = SimpleNamespace(nse_symbol="ANONDITA", bse_code=None, name="Anondita", industry=None, sector=None, source_tier="t")

    async def fake_resolve(symbol, session):
        return company

    async def fake_about(session, c):
        return None

    async def sme(session, symbol):
        return symbol == "ANONDITA"

    monkeypatch.setattr("app.api.routes.companies.resolve_company", fake_resolve)
    monkeypatch.setattr("app.api.routes.companies.svc.get_about", fake_about)
    monkeypatch.setattr("app.api.routes.companies.is_sme_symbol", sme)
    assert client.get("/companies/ANONDITA").json()["is_sme"] is True
