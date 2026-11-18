from datetime import date
from pathlib import Path

from app.ingestion.mf_amfi import normalise_category, parse_navall

FIXTURE = Path(__file__).parent / "fixtures" / "navall_sample.txt"


def _by_code():
    return {r.scheme_code: r for r in parse_navall(FIXTURE.read_text())}


def test_parses_schemes_and_skips_garbage():
    rows = _by_code()
    assert set(rows) == {122639, 122640, 153964, 100001, 100002}


def test_direct_growth_row():
    r = _by_code()[122639]
    assert r.fund_house == "Parag Parikh Mutual Fund"
    assert r.scheme_type == "open_ended"
    assert (r.category, r.sub_category) == ("Equity", "Flexi Cap Fund")
    assert (r.plan, r.option) == ("direct", "growth")
    assert r.isin_growth == "INF879O01027" and r.isin_reinvest is None
    assert r.base_name == "Parag Parikh Flexi Cap Fund"
    assert str(r.nav) == "85.1234" and r.nav_date == date(2026, 11, 17)


def test_idcw_reinvest_isin_and_regular_plan():
    assert _by_code()[153964].option == "idcw"
    assert _by_code()[153964].isin_reinvest == "INF879O01XX1"
    assert _by_code()[122640].plan == "regular"


def test_na_nav_and_blank_plan_columns_fall_back_to_name():
    r = _by_code()[100001]
    assert r.nav is None
    assert (r.plan, r.option) == ("direct", "growth")
    assert (r.category, r.sub_category) == ("Other", "Index Funds")


def test_closed_ended_and_legacy_header():
    r = _by_code()[100002]
    assert r.scheme_type == "close_ended"
    assert r.category == "Other"  # header "(Growth)" carries no real category
    assert r.plan == "regular"


def test_normalise_category_aliases():
    assert normalise_category("Equity Schemes - ELSS- Tax Saver Fund") == ("Equity", "ELSS Tax Saver Fund")
    assert normalise_category("Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage") == (
        "Hybrid",
        "Balanced Advantage Fund",
    )
    assert normalise_category("Income/Debt Oriented Schemes - Liquid Fund") == ("Debt", "Liquid Fund")
    assert normalise_category("Exchange Traded Funds (ETFs) - Gold ETF") == ("Other", "Gold ETF")
    assert normalise_category("Solution Oriented Scheme - Retirement Fund") == ("Solution Oriented", "Retirement Fund")


def test_mfapi_parse_history_sorts_and_drops_bad_points():
    from app.ingestion.mf_mfapi import parse_history

    payload = {"data": [
        {"date": "17-11-2026", "nav": "107.5"},
        {"date": "16-11-2026", "nav": "107.1"},
        {"date": "15-11-2026", "nav": "0.00000"},
        {"date": "garbage", "nav": "1"},
        {"nav": "3"},
    ]}
    assert parse_history(payload) == [(date(2026, 11, 16), 107.1), (date(2026, 11, 17), 107.5)]
    assert parse_history(None) == [] and parse_history({"data": "x"}) == []


def test_normalise_category_merges_spelling_variants():
    assert normalise_category("Equity Scheme - ELSS") == ("Equity", "ELSS Tax Saver Fund")
    assert normalise_category("Other Scheme - FoF Domestic")[1] == "Fund of Funds (Domestic)"
    assert normalise_category("Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)") == (
        "Other",
        "Fund of Funds (Domestic)",
    )
    assert normalise_category("Other Scheme - FoF Overseas")[1] == "Fund of Funds (Overseas)"
    assert normalise_category("Overseas Fund of Funds - Fund of Funds investing overseas")[1] == (
        "Fund of Funds (Overseas)"
    )


def test_index_fund_variants_keep_their_group():
    assert normalise_category("Index Funds - Equity Funds") == ("Other", "Index Funds - Equity")
    assert normalise_category("Index Funds - Debt Funds") == ("Other", "Index Funds - Debt")
    assert normalise_category("Other Scheme - Index Funds") == ("Other", "Index Funds")


def _one(line: str):
    return parse_navall("Open Ended Schemes(Equity Scheme - Flexi Cap Fund)\n\nX Mutual Fund\n" + line)[0]


def test_growth_in_fund_name_does_not_make_idcw_a_growth_plan():
    # explicit columns
    r = _one("1;INF000000001;-;Axis Growth Opportunities Fund - Direct Plan - IDCW;Direct Plan;IDCW;10;17-Nov-2026")
    assert (r.plan, r.option) == ("direct", "idcw")
    # blank columns: only the plan/option tail of the name counts
    r = _one("2;INF000000002;-;Axis Growth Opportunities Fund - Direct Plan - IDCW;;;10;17-Nov-2026")
    assert (r.plan, r.option) == ("direct", "idcw")
    r = _one("3;INF000000003;-;Direct Growth Fund - Regular Plan - Growth;;;10;17-Nov-2026")
    assert (r.plan, r.option) == ("regular", "growth")
    r = _one("4;INF000000004;-;Direct Growth Fund - Monthly Dividend Payout;;;10;17-Nov-2026")
    assert (r.plan, r.option) == ("regular", "idcw")
