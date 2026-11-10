"""Offline tests: the IPO/GMP aggregator parser against the maintainer-saved
fixture, plus the /ipos route shape (service monkeypatched). No network, no DB.
"""

from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.ingestion.tier3_ipo_scraper.scraper import (
    _category_from_badges,
    _parse_dmon,
    _parse_ipo_rows,
)
from app.main import app

FIXTURE = Path(__file__).parent / "fixtures" / "investorgain_ipo_gmp.html"
REF = date(2026, 9, 6)  # the day the fixture was saved
SME_FIXTURE = Path(__file__).parent / "fixtures" / "investorgain_sme_rows.html"


@pytest.fixture(scope="module")
def rows() -> list[dict]:
    return _parse_ipo_rows(FIXTURE.read_text(encoding="utf-8", errors="replace"), ref=REF)


def _by_name(rows: list[dict], needle: str) -> dict:
    return next(r for r in rows if needle.lower() in r["name"].lower())


class TestCategory:
    """SME vs mainboard comes from the badge beside the name. Regression: the
    aggregator badges SME issues "BSE SME" / "NSE SME", and an exact-match
    check on "SME" classified every one of them as mainboard."""

    @pytest.mark.parametrize(
        ("badges", "expected"),
        [
            (["NSE SME"], "sme"),
            (["BSE SME"], "sme"),
            (["SME"], "sme"),
            (["bse sme", "C", "Allotted"], "sme"),
            (["IPO"], "mainboard"),
            (["IPO", "U"], "mainboard"),
            ([], "mainboard"),
            (["ASMER"], "mainboard"),  # SME must be a word, not a substring
        ],
    )
    def test_category_from_badges(self, badges, expected):
        assert _category_from_badges(badges) == expected

    def test_real_rows_are_classified_from_their_badges(self):
        rows = _parse_ipo_rows(SME_FIXTURE.read_text(encoding="utf-8"), ref=date(2026, 11, 10))
        by = {r["name"]: r["category"] for r in rows}
        assert by == {
            "Vedant Poly Fabs": "sme",  # NSE SME
            "Johnsoncab Electricals": "sme",  # BSE SME
            "Bombay Coated and Special Steels": "mainboard",  # IPO
        }

    def test_sme_rows_still_parse_their_numbers(self):
        rows = _parse_ipo_rows(SME_FIXTURE.read_text(encoding="utf-8"), ref=date(2026, 11, 10))
        vedant = next(r for r in rows if r["name"] == "Vedant Poly Fabs")
        assert (vedant["price"], vedant["lot_size"], vedant["ipo_size_cr"]) == (94.0, 1200, 56.68)


class TestParser:
    def test_row_count_and_uniqueness(self, rows):
        assert len(rows) >= 20
        slugs = [r["slug"] for r in rows]
        assert len(slugs) == len(set(slugs))
        assert all(r["name"] and r["slug"] and r["category"] in ("mainboard", "sme") for r in rows)

    def test_upcoming_ipo_fields(self, rows):
        r = _by_name(rows, "Veegaland Developers")
        assert r["status"] == "upcoming"
        assert r["slug"] == "veegaland-developers-ipo"
        assert r["gmp"] == 30.0
        assert r["gmp_pct"] == 21.43
        assert (r["gmp_low"], r["gmp_high"]) == (18.0, 30.0)
        assert r["rating"] == 4
        assert r["price"] == 140.0
        assert r["ipo_size_cr"] == 210.0
        assert r["lot_size"] == 107
        assert r["open_date"] == date(2026, 9, 10)
        assert r["close_date"] == date(2026, 9, 15)
        assert r["allotment_date"] == date(2026, 9, 16)
        assert r["listing_date"] == date(2026, 9, 18)
        assert r["anchor"] is True
        assert r["subscription_times"] is None  # not open yet
        assert r["source_url"].endswith("/veegaland-developers-ipo/1601/")

    def test_listed_ipo_has_subscription_and_status(self, rows):
        r = _by_name(rows, "Symbiotec Pharmalab")
        assert r["status"] == "listed"
        assert r["subscription_times"] == 75.08
        assert r["listing_date"] < REF

    def test_missing_gmp_is_none_not_zero(self, rows):
        r = _by_name(rows, "Manika Plastech")
        assert r["gmp"] is None  # shown as "--" on the page

    def test_negative_gmp(self, rows):
        r = _by_name(rows, "Purple Style Labs")
        assert r["gmp"] == -10.0
        assert r["gmp_pct"] == -1.74

    def test_updated_on_is_tz_aware(self, rows):
        r = _by_name(rows, "Rentomojo")
        assert isinstance(r["updated_on"], datetime)
        assert r["updated_on"].tzinfo is not None


class TestParseDmon:
    def test_basic(self):
        assert _parse_dmon("10-Sep", date(2026, 9, 6)) == date(2026, 9, 10)

    def test_year_rollover_backwards(self):
        # "28-Dec" seen in early January belongs to the previous year
        assert _parse_dmon("28-Dec", date(2027, 1, 3)) == date(2026, 12, 28)

    def test_ignores_trailing_noise(self):
        assert _parse_dmon("1-Sep GMP: 44", date(2026, 9, 6)) == date(2026, 9, 1)

    def test_none_on_garbage(self):
        assert _parse_dmon("", date(2026, 9, 6)) is None
        assert _parse_dmon("soon", date(2026, 9, 6)) is None


@pytest.fixture
def client():
    async def fake_get_db():
        yield None

    app.dependency_overrides[deps.get_db] = fake_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_ipos_route_shape(client, monkeypatch):
    async def fake_get_ipos(session, status=None):
        return [
            {
                "slug": "acme-ipo", "name": "Acme", "source_url": None,
                "category": "mainboard", "status": "open", "price": 100.0,
                "ipo_size_cr": 500.0, "lot_size": 10, "rating": 3,
                "subscription_times": 2.5, "anchor": True,
                "gmp": 12.0, "gmp_pct": 12.0, "gmp_low": 8.0, "gmp_high": 15.0,
                "gmp_updated_at": datetime(2026, 9, 6, 14, 0),
                "open_date": date(2026, 9, 5), "close_date": date(2026, 9, 8),
                "allotment_date": date(2026, 9, 9), "listing_date": date(2026, 9, 12),
                "source_tier": "tier3_ipo_aggregator",
                "fetched_at": datetime(2026, 9, 6, 14, 5),
            }
        ]

    monkeypatch.setattr("app.api.routes.ipos.svc.get_ipos", fake_get_ipos)
    res = client.get("/ipos?status=open")
    assert res.status_code == 200
    body = res.json()
    assert body[0]["slug"] == "acme-ipo"
    assert body[0]["gmp_pct"] == 12.0
    assert body[0]["category"] == "mainboard"


def test_ipos_route_rejects_bad_status(client):
    assert client.get("/ipos?status=pending").status_code == 422


def test_ipos_ingest_requires_token(client, monkeypatch):
    # no ipo_ingest_token configured -> 503 (set explicitly so a token in the
    # developer's local .env can't change the outcome)
    monkeypatch.setattr("app.api.routes.ipos._settings.ipo_ingest_token", "")
    res = client.post("/ipos/ingest", json={"rows": []})
    assert res.status_code == 503


def test_ipos_ingest_token_matrix(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.ipos._settings.ipo_ingest_token", "s3cret")

    async def fake_ingest(session, rows):
        return {"ingested": len(rows), "total": len(rows)}

    monkeypatch.setattr("app.api.routes.ipos.svc.ingest_ipos", fake_ingest)

    assert client.post("/ipos/ingest", json={"rows": []}).status_code == 401
    assert client.post(
        "/ipos/ingest", json={"rows": []}, headers={"Authorization": "Bearer nope"}
    ).status_code == 401
    ok = client.post(
        "/ipos/ingest", json={"rows": [{"slug": "x", "name": "X"}]},
        headers={"Authorization": "Bearer s3cret"},
    )
    assert ok.status_code == 200
    assert ok.json()["ingested"] == 1


class TestRowToValues:
    """The ingest job POSTs JSON — dates arrive as ISO strings and must
    round-trip back to date/datetime (`_coerce`)."""

    def test_iso_strings_coerced(self):
        from app.services.ipo_service import _row_to_values

        v = _row_to_values(
            {
                "slug": "acme-ipo",
                "name": "Acme",
                "open_date": "2026-09-10",
                "listing_date": "2026-09-18T00:00:00",
                "updated_on": "2026-09-06T14:30:00+05:30",
                "gmp": 30.0,
            }
        )
        assert v is not None
        assert v["open_date"] == date(2026, 9, 10)
        assert v["listing_date"] == date(2026, 9, 18)
        assert isinstance(v["gmp_updated_at"], datetime)  # remapped from updated_on
        assert v["gmp"] == 30.0

    def test_native_types_pass_through(self):
        from app.services.ipo_service import _row_to_values

        v = _row_to_values({"slug": "a", "name": "A", "open_date": date(2026, 9, 1)})
        assert v["open_date"] == date(2026, 9, 1)

    def test_drops_rows_without_slug_or_name(self):
        from app.services.ipo_service import _row_to_values

        assert _row_to_values({"name": "A"}) is None
        assert _row_to_values({"slug": "a"}) is None
