"""Offline tests for the in-memory ranked company search."""

from app.ingestion.company_master import parse_equity_csv
from app.services.search_index import CompanyEntry, rank_companies

UNIVERSE = [
    CompanyEntry("RELIANCE", "Reliance Industries Limited", isin="INE002A01018", market_cap=1900000),
    CompanyEntry("RELINFRA", "Reliance Infrastructure Limited", market_cap=9000),
    CompanyEntry("RPOWER", "Reliance Power Limited", market_cap=7000),
    CompanyEntry("TCS", "Tata Consultancy Services Limited", isin="INE467B01029", market_cap=1400000),
    CompanyEntry("TATAMOTORS", "Tata Motors Limited", market_cap=300000),
    CompanyEntry("TATASTEEL", "Tata Steel Limited", market_cap=180000),
    CompanyEntry("THEJO", "Thejo Engineering Limited", series="SM", is_sme=True),
    CompanyEntry("HDFCBANK", "HDFC Bank Limited", market_cap=1200000),
    CompanyEntry("M&M", "Mahindra & Mahindra Limited", market_cap=350000),
]


def symbols(query: str, limit: int = 15) -> list[str]:
    return [e.symbol for e in rank_companies(UNIVERSE, query, limit)]


def test_exact_symbol_beats_prefix_and_name_matches():
    assert symbols("tcs")[0] == "TCS"


def test_symbol_prefix_ranks_before_name_word_match():
    assert symbols("rel")[:3] == ["RELIANCE", "RELINFRA", "RPOWER"]


def test_company_name_word_prefix_finds_symbol_with_different_spelling():
    assert symbols("consultancy") == ["TCS"]


def test_token_order_does_not_matter():
    assert "TATAMOTORS" in symbols("motors tata")


def test_multi_word_query_narrows():
    assert symbols("tata steel") == ["TATASTEEL"]


def test_isin_exact_match_wins():
    assert symbols("INE467B01029") == ["TCS"]


def test_typo_is_tolerated():
    assert symbols("relaince")[0] == "RELIANCE"


def test_sme_listed_last_among_equal_matches():
    universe = [CompanyEntry("AAA", "Alpha Ltd", is_sme=True), CompanyEntry("AAB", "Alpha Beta Ltd")]
    assert [e.symbol for e in rank_companies(universe, "alpha")] == ["AAB", "AAA"]


def test_bigger_company_first_on_equal_score():
    assert symbols("tata")[:2] == ["TATAMOTORS", "TATASTEEL"]


def test_ampersand_symbol_is_found_by_name():
    assert "M&M" in symbols("mahindra")


def test_blank_and_symbol_only_punctuation_return_nothing():
    assert symbols("   ") == []
    assert symbols("!!!") == []


def test_limit_is_respected():
    assert len(symbols("tata", limit=1)) == 1


CSV_SAMPLE = (
    "SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\n"
    "20MICRONS,20 Microns Limited,EQ,06-OCT-2008,5,1,INE144J01027,5\n"
    "THEJO,Thejo Engineering Limited,SM,18-SEP-2012,10,300,INE121N01019,10\n"
    "\n"
    "**This file is updated at 10:30 am everyday.\n"
)


def test_parse_equity_csv_handles_spaced_headers_and_footer():
    rows = parse_equity_csv(CSV_SAMPLE, is_sme=False)
    assert [r["symbol"] for r in rows] == ["20MICRONS", "THEJO"]
    assert rows[0]["isin"] == "INE144J01027"
    assert rows[0]["series"] == "EQ"
    assert str(rows[0]["listing_date"]) == "2008-10-06"
    assert float(rows[0]["face_value"]) == 5.0


def test_parse_equity_csv_flags_sme():
    assert all(r["is_sme"] for r in parse_equity_csv(CSV_SAMPLE, is_sme=True))


def test_bundled_equity_csv_parses_to_full_universe():
    from app.ingestion.company_master import _bundled_text

    rows = parse_equity_csv(_bundled_text("EQUITY_L.csv") or "", is_sme=False)
    assert len(rows) > 2000
    assert all(r["isin"] for r in rows)


def test_fetch_equity_list_falls_back_to_bundled_when_live_is_unusable(monkeypatch):
    import asyncio

    from app.ingestion import company_master

    async def blocked(url):
        return "<html>Access Denied</html>"

    monkeypatch.setattr(company_master, "_fetch_text", blocked)
    companies = asyncio.run(company_master.fetch_equity_list())
    assert len(companies) > 2000
    assert any(c["symbol"] == "TCS" for c in companies)
