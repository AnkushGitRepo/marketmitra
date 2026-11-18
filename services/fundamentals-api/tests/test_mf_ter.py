"""Expense ratios from the community TER tracker (ADR 0067): CSV parsing and the
conservative name matcher. Offline; the matcher is pure."""

from datetime import date

import pytest

from app.ingestion.mf_ter import (
    SchemeRef,
    TerRow,
    match_ter,
    normalise_name,
    parse_ter_csv,
)

HEADER = (
    '"NSDL Scheme Code","Scheme Name","Regular Plan - Base Expense Ratio (BER) (%)",'
    '"Regular Plan - Brokerage cost (%)","Regular Plan - Transaction Cost incurred for the purpose of execution of trade (%)",'
    '"Regular Plan - Statutory Levies (including GST) (%)","Regular Plan - Total TER (%)",'
    '"Direct Plan - Base Expense Ratio (BER) (%)","Direct Plan - Brokerage cost (%)",'
    '"Direct Plan - Transaction Cost incurred for the purpose of execution of trade (%)",'
    '"Direct Plan - Statutory Levies (including GST) (%)","Direct Plan - Total TER (%)"'
)


def _row(code: str, name: str, regular: str, direct: str) -> str:
    return f'"{code}","{name}",1,0,0,0,{regular},1,0,0,0,{direct}'


def _csv(*rows: str) -> str:
    return "\n".join([HEADER, *rows]) + "\n"


class TestNormalise:
    def test_case_punctuation_and_ampersand(self):
        assert normalise_name("HDFC Large & Mid Cap Fund") == normalise_name("hdfc large and mid cap fund")
        assert normalise_name("  Axis   Bluechip-Fund. ") == "axis bluechip fund"


class TestParse:
    def test_reads_both_plans(self):
        rows, stats = parse_ter_csv(_csv(_row("A/1", "Alpha Flexi Cap Fund", "1.75", "0.62")))
        assert rows == [TerRow(name="Alpha Flexi Cap Fund", regular=1.75, direct=0.62)]
        assert stats["rows"] == 1 and stats["ambiguous_names"] == 0

    @pytest.mark.parametrize("bad", ["", "abc", "0", "0.0", "-1", "4.01", "11", "nan", "inf"])
    def test_unusable_values_become_none_not_zero(self, bad):
        rows, _ = parse_ter_csv(_csv(_row("A/1", "Alpha Fund", bad, "0.5")))
        assert rows[0].regular is None and rows[0].direct == 0.5

    def test_duplicate_normalised_names_are_dropped_as_ambiguous(self):
        rows, stats = parse_ter_csv(
            _csv(_row("A/1", "Beta Fund", "1.0", "0.5"), _row("A/2", "BETA  fund", "2.0", "1.0"), _row("A/3", "Gamma Fund", "1.5", "0.7"))
        )
        assert [r.name for r in rows] == ["Gamma Fund"]
        assert stats["ambiguous_names"] == 1

    def test_missing_columns_raise_a_clear_error(self):
        with pytest.raises(ValueError, match="Total TER"):
            parse_ter_csv('"NSDL Scheme Code","Scheme Name"\n"A","B"\n')

    def test_garbage_rows_are_skipped(self):
        rows, stats = parse_ter_csv(_csv(_row("A/1", "", "1.0", "0.5"), _row("A/2", "Delta Fund", "1.0", "0.5")))
        assert [r.name for r in rows] == ["Delta Fund"] and stats["skipped"] == 1


def _ref(code, base, plan="direct", option="growth", sub="Flexi Cap Fund", house="Alpha Mutual Fund"):
    return SchemeRef(scheme_code=code, base_name=base, fund_house=house, plan=plan, option=option, sub_category=sub)


class TestMatch:
    def test_plan_specific_ter_applies_to_every_option_of_that_plan(self):
        schemes = [
            _ref(1, "Alpha Flexi Cap Fund", "direct", "growth"),
            _ref(2, "Alpha Flexi Cap Fund", "direct", "idcw"),
            _ref(3, "Alpha Flexi Cap Fund", "regular", "growth"),
        ]
        out, stats = match_ter([TerRow("Alpha Flexi Cap Fund", regular=1.8, direct=0.6)], schemes)
        assert out == {1: 0.6, 2: 0.6, 3: 1.8}
        assert stats["matched_rows"] == 1 and stats["unmatched_rows"] == 0

    def test_matching_ignores_case_and_punctuation(self):
        out, _ = match_ter([TerRow("ALPHA  flexi-cap FUND", 1.8, 0.6)], [_ref(1, "Alpha Flexi Cap Fund")])
        assert out == {1: 0.6}

    def test_unmatched_rows_are_counted_and_sampled(self):
        out, stats = match_ter([TerRow("Nobody Fund", 1.0, 0.5)], [_ref(1, "Alpha Fund")])
        assert out == {} and stats["unmatched_rows"] == 1 and stats["unmatched_sample"] == ["Nobody Fund"]

    def test_same_name_in_two_fund_houses_is_ambiguous(self):
        schemes = [_ref(1, "Twin Fund", house="A Mutual Fund"), _ref(2, "Twin Fund", house="B Mutual Fund")]
        out, stats = match_ter([TerRow("Twin Fund", 1.0, 0.5)], schemes)
        assert out == {} and stats["ambiguous_schemes"] == 2

    def test_every_variant_of_one_fund_gets_the_plans_figure(self):
        # Liquid funds list daily/weekly/monthly IDCW options, and a fund can carry
        # more than one Growth code: all are the same fund, so all share its TER.
        schemes = [
            _ref(1, "Liquid Fund", "direct", "growth"), _ref(2, "Liquid Fund", "direct", "growth"),
            _ref(3, "Liquid Fund", "direct", "idcw"), _ref(4, "Liquid Fund", "direct", "idcw"),
            _ref(5, "Liquid Fund", "regular", "idcw"),
        ]
        out, stats = match_ter([TerRow("Liquid Fund", regular=0.4, direct=0.2)], schemes)
        assert out == {1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.4}
        assert stats["ambiguous_schemes"] == 0

    def test_missing_plan_ter_leaves_that_plan_empty(self):
        schemes = [_ref(1, "Alpha Fund", "direct"), _ref(2, "Alpha Fund", "regular")]
        out, _ = match_ter([TerRow("Alpha Fund", regular=None, direct=0.5)], schemes)
        assert out == {1: 0.5}

    def test_etf_with_only_a_regular_ter_uses_it(self):
        # ETFs have one plan; the file lists the real figure under "Regular" and 0.0 under "Direct".
        etf = _ref(9, "Gold ETF", plan="direct", sub="Gold ETF")
        out, _ = match_ter([TerRow("Gold ETF", regular=0.47, direct=None)], [etf])
        assert out == {9: 0.47}

    def test_non_etf_does_not_borrow_the_other_plans_ter(self):
        out, _ = match_ter([TerRow("Alpha Fund", regular=1.8, direct=None)], [_ref(1, "Alpha Fund", "direct")])
        assert out == {}


def test_as_of_is_a_date_type():
    assert isinstance(date(2026, 11, 18), date)
