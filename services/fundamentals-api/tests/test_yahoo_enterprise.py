"""Yahoo's balance sheet and enterprise figures as stored rows (#365). Pure: dicts in, rows out.

The numbers are what Yahoo returned for Reliance (a large, indebted group) and Newgen (a small, cash-rich company) on 2026-11-25.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.ingestion.yahoo_enterprise import (
    CASH_LABEL,
    DEBT_LABEL,
    balance_sheet_items,
    enterprise_ratios,
    is_lender,
)

RELIANCE_BS = {
    "Total Debt": {date(2026, 3, 31): 3_980_000_000_000.0, date(2025, 3, 31): 3_695_750_000_000.0},
    "Cash Cash Equivalents And Short Term Investments": {date(2026, 3, 31): 2_772_120_000_000.0, date(2025, 3, 31): 2_387_920_000_000.0},
    "Cash And Cash Equivalents": {date(2026, 3, 31): 700_000_000_000.0},
}
RELIANCE_INFO = {
    "financialCurrency": "INR",
    "enterpriseValue": 22_581_224_669_184,
    "totalCash": 2_603_139_989_504,
    "totalDebt": 5_020_490_137_600,
    "ebitda": 1_868_889_980_928,
}


def _by(rows, label):
    return {r["period_end"]: r["value"] for r in rows if r["label"] == label}


def test_balance_sheet_becomes_crore_rows_for_debt_and_cash():
    rows = balance_sheet_items(RELIANCE_BS)
    assert _by(rows, DEBT_LABEL)[date(2026, 3, 31)] == Decimal(398000)
    assert _by(rows, CASH_LABEL)[date(2026, 3, 31)] == Decimal(277212)
    assert all(r["period_type"] == "annual" for r in rows)
    assert len(rows) == 4


def test_cash_falls_back_to_cash_and_equivalents_when_short_term_investments_are_missing():
    rows = balance_sheet_items({"Cash And Cash Equivalents": {date(2026, 3, 31): 50_000_000.0}})
    assert _by(rows, CASH_LABEL) == {date(2026, 3, 31): Decimal(5)}


def test_missing_values_and_nan_are_skipped_not_stored_as_zero():
    rows = balance_sheet_items({"Total Debt": {date(2026, 3, 31): None, date(2025, 3, 31): float("nan"), date(2024, 3, 31): 10_000_000.0}})
    assert _by(rows, DEBT_LABEL) == {date(2024, 3, 31): Decimal(1)}


def test_nothing_to_store_for_an_empty_balance_sheet():
    assert balance_sheet_items({}) == []


def test_enterprise_ratios_in_crore_with_net_debt_and_the_multiple():
    ratios = {r["name"]: r for r in enterprise_ratios(RELIANCE_INFO, sector="Oil, Gas & Consumable Fuels")}
    assert ratios["Enterprise Value"]["value"] == Decimal("2258122.47")  # crore, to the paisa
    assert ratios["Enterprise Value"]["unit"] == "INR_CR"
    assert ratios["Total Cash"]["value"] == Decimal(260314)
    assert ratios["Net Debt"]["value"] == Decimal("241735.01")
    assert ratios["EBITDA (TTM)"]["value"] == Decimal(186889)
    assert ratios["EV/EBITDA"]["unit"] == "x"
    assert round(ratios["EV/EBITDA"]["value"], 1) == Decimal("12.1")


def test_a_net_cash_company_has_negative_net_debt():
    info = {"financialCurrency": "INR", "enterpriseValue": 47_300_771_840, "totalCash": 11_144_639_488, "totalDebt": 393_560_992, "ebitda": 4_065_012_480}
    ratios = {r["name"]: r["value"] for r in enterprise_ratios(info, sector="Information Technology")}
    assert ratios["Net Debt"] < 0
    assert round(ratios["EV/EBITDA"], 1) == Decimal("11.6")


def test_no_multiple_when_ebitda_is_not_positive_but_the_rest_is_kept():
    ratios = {r["name"] for r in enterprise_ratios({**RELIANCE_INFO, "ebitda": -5_000_000_000}, sector="Metals & Mining")}
    assert "EV/EBITDA" not in ratios
    assert "Enterprise Value" in ratios


def test_banks_and_other_lenders_get_none_because_ev_is_not_meaningful():
    assert enterprise_ratios(RELIANCE_INFO, sector="Financial Services") == []


def test_a_non_rupee_report_is_refused_rather_than_mislabelled():
    assert enterprise_ratios({**RELIANCE_INFO, "financialCurrency": "USD"}, sector="Energy") == []


def test_missing_fields_are_left_out():
    names = {r["name"] for r in enterprise_ratios({"financialCurrency": "INR", "enterpriseValue": 1e9}, sector=None)}
    assert names == {"Enterprise Value"}


@pytest.mark.parametrize(("sector", "expected"), [("Financial Services", True), ("financial services", True), ("Information Technology", False), (None, False)])
def test_is_lender(sector, expected):
    assert is_lender(sector) is expected


def test_a_real_yahoo_dataframe_becomes_the_dicts_the_conversion_reads():
    import pandas as pd

    from app.ingestion.tier2_yfinance import frame_to_rows

    frame = pd.DataFrame(
        {pd.Timestamp("2026-03-31"): [3_980_000_000_000.0, float("nan")], pd.Timestamp("2025-03-31"): [3_695_750_000_000.0, 2_387_920_000_000.0]},
        index=["Total Debt", "Cash Cash Equivalents And Short Term Investments"],
    )
    rows = frame_to_rows(frame)
    assert rows["Total Debt"][date(2026, 3, 31)] == 3_980_000_000_000.0
    assert rows["Cash Cash Equivalents And Short Term Investments"][date(2026, 3, 31)] is None
    items = balance_sheet_items(rows)
    assert {(i["label"], i["period_end"]) for i in items} == {
        (DEBT_LABEL, date(2026, 3, 31)),
        (DEBT_LABEL, date(2025, 3, 31)),
        (CASH_LABEL, date(2025, 3, 31)),
    }


def test_an_empty_or_missing_frame_is_no_rows():
    import pandas as pd

    from app.ingestion.tier2_yfinance import frame_to_rows

    assert frame_to_rows(pd.DataFrame()) == {}
    assert frame_to_rows(None) == {}
