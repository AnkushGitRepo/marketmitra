"""Offline tests: the per-IPO subscription page parser (#285) against the maintainer-saved fixture, and the
dashboard-link -> subscription-page URL pattern. No network, no DB."""

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.ingestion.tier3_ipo_scraper.subscription import parse_subscription, subscription_url

FIXTURE = Path(__file__).parent / "fixtures" / "investorgain_subscription_sme.html"
IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture(scope="module")
def html() -> str:
    return FIXTURE.read_text(encoding="utf-8", errors="replace")


class TestSubscriptionUrl:
    def test_swaps_the_gmp_page_for_the_subscription_page(self) -> None:
        assert (
            subscription_url("https://www.investorgain.com/gmp/watrana-rentals-ipo/1818/")
            == "https://www.investorgain.com/subscription/watrana-rentals-ipo/1818/"
        )

    @pytest.mark.parametrize(
        ("href", "expected"),
        [
            # What the live page serves (#294): relative links. The saved fixture had absolute ones, because "Save as" rewrites them.
            ("/gmp/watrana-rentals-ipo/1818/", "https://www.investorgain.com/subscription/watrana-rentals-ipo/1818/"),
            ("/gmp/mahanadi-coalfields-ipo/2401", "https://www.investorgain.com/subscription/mahanadi-coalfields-ipo/2401/"),
            ("https://investorgain.com/gmp/acme-ipo/7/", "https://www.investorgain.com/subscription/acme-ipo/7/"),
        ],
    )
    def test_accepts_the_relative_link_the_live_page_serves(self, href: str, expected: str) -> None:
        assert subscription_url(href) == expected

    @pytest.mark.parametrize(
        "href",
        [
            None,
            "",
            "https://www.investorgain.com/report/ipo-gmp-live/331/",
            "https://evil.example/gmp/x-ipo/1/",
            "https://www.investorgain.com/gmp/x-ipo/",
            "//evil.example/gmp/x-ipo/1/",
            "/gmp/x-ipo/",
            "/gmp/x-ipo/abc/",
            "/subscription/x-ipo/1/",
            "/gmp/../report/1/",
            "http://www.investorgain.com/gmp/x-ipo/1/",
        ],
    )
    def test_is_none_for_anything_that_is_not_an_investorgain_gmp_page_link(self, href: str | None) -> None:
        assert subscription_url(href) is None


class TestParseSubscription:
    def test_reads_the_latest_day_for_every_category(self, html: str) -> None:
        got = parse_subscription(html)
        assert got is not None
        assert got["sub_qib"] == 0.0
        assert got["sub_nii"] == 20.00
        assert got["sub_snii"] == 13.23
        assert got["sub_bnii"] == 23.39
        assert got["sub_retail"] == 15.42
        assert got["sub_total"] == 11.98
        assert got["sub_as_of"] == datetime(2026, 11, 20, 17, 56, tzinfo=IST)

    def test_takes_the_last_row_not_the_first(self, html: str) -> None:
        # Day 1 total was 3.78x, day 2 is 11.98x.
        assert parse_subscription(html)["sub_total"] == 11.98  # type: ignore[index]

    def test_is_none_when_there_is_no_bid_table(self) -> None:
        assert parse_subscription("<html><body><p>Subscription opens soon</p></body></html>") is None

    def test_is_none_for_a_table_with_no_rows_yet(self) -> None:
        empty = (
            '<table class="bid-table"><thead><tr><th>Day</th><th>Date</th><th>QIB</th><th>NII</th>'
            "<th>S-NII</th><th>B-NII</th><th>RII</th><th>Total</th></tr></thead><tbody></tbody></table>"
        )
        assert parse_subscription(empty) is None

    def test_leaves_a_missing_or_dashed_column_unknown_instead_of_zero(self) -> None:
        page = (
            '<table class="bid-table"><thead><tr><th>Day</th><th>Date</th><th>NII</th><th>RII</th>'
            "<th>Total</th></tr></thead><tbody><tr><td>Day 1</td><td>19th Nov 2026 17:56</td>"
            "<td>--</td><td>2.50x</td><td>2.50x</td></tr></tbody></table>"
        )
        got = parse_subscription(page)
        assert got is not None
        assert got["sub_retail"] == 2.5
        assert got["sub_nii"] is None
        assert got["sub_snii"] is None
        assert got["sub_qib"] is None

    def test_keeps_the_timestamp_unknown_when_the_date_cell_cannot_be_read(self) -> None:
        page = (
            '<table class="bid-table"><thead><tr><th>Day</th><th>Date</th><th>RII</th><th>Total</th></tr></thead>'
            "<tbody><tr><td>Day 1</td><td>sometime</td><td>1.10x</td><td>1.10x</td></tr></tbody></table>"
        )
        got = parse_subscription(page)
        assert got is not None
        assert got["sub_as_of"] is None
        assert got["sub_retail"] == 1.1
