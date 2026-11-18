from datetime import date, timedelta

import pytest

from app.services.mf_metrics import (
    adjust_for_unit_changes,
    compute_metrics,
    max_drawdown,
    nav_on_or_before,
    period_return,
    sip_xirr,
)


def _series(days: int, daily: float = 0.0005, start: float = 100.0, end: date = date(2026, 11, 17)):
    """Compounding series, one point per calendar day, ending at `end`."""
    out, nav = [], start
    for i in range(days):
        out.append((end - timedelta(days=days - 1 - i), round(nav, 6)))
        nav *= 1 + daily
    return out


def test_nav_on_or_before_picks_prior_point():
    s = [(date(2026, 1, 1), 10.0), (date(2026, 1, 5), 11.0)]
    assert nav_on_or_before(s, date(2026, 1, 4)) == 10.0
    assert nav_on_or_before(s, date(2025, 12, 31)) is None


def test_period_return_absolute_under_a_year_cagr_over():
    s = _series(800)
    six_m = period_return(s, months=6)
    assert six_m == pytest.approx(((1.0005) ** 182 - 1) * 100, rel=0.02)
    three_y = period_return(_series(1500), months=36)
    assert three_y == pytest.approx(((1.0005) ** 365 - 1) * 100, rel=0.02)  # annualised


def test_period_return_none_without_enough_history():
    assert period_return(_series(100), months=12) is None


def test_max_drawdown():
    s = [(date(2026, 1, i + 1), v) for i, v in enumerate([100, 120, 90, 110, 130])]
    assert max_drawdown(s) == pytest.approx(-25.0)


def test_sip_xirr_matches_flat_growth():
    # NAV rises 12%/yr smoothly -> SIP XIRR should be close to 12%.
    s = _series(1200, daily=(1.12 ** (1 / 365)) - 1)
    assert sip_xirr(s, years=3) == pytest.approx(12.0, abs=0.7)


def test_compute_metrics_shape_and_risk():
    noisy = [(d, v * (1.004 if i % 2 else 0.996)) for i, (d, v) in enumerate(_series(1900, daily=0.0004))]
    m = compute_metrics(noisy)
    assert m["ret_1y"] is not None and m["ret_5y"] is not None
    assert m["ret_10y"] is None
    assert m["std_dev_3y"] is not None and m["sharpe_3y"] is not None
    assert m["max_drawdown_3y"] is not None and m["max_drawdown_3y"] <= 0


def test_compute_metrics_empty():
    assert compute_metrics([])["ret_1y"] is None


def test_unit_split_does_not_corrupt_returns():
    # Steady 0.05%/day for 1500 days, with a 1:100 unit split (NAV / 100) halfway.
    base = _series(1500)
    split_at = 750
    split = [(d, nav if i < split_at else nav / 100) for i, (d, nav) in enumerate(base)]
    assert period_return(split, months=12) == pytest.approx(period_return(base, months=12), rel=0.05)
    assert compute_metrics(split)["ret_3y"] == pytest.approx(compute_metrics(base)["ret_3y"], rel=0.05)
    assert compute_metrics(split)["max_drawdown_3y"] == pytest.approx(0.0, abs=1e-6)


def test_adjust_leaves_normal_series_untouched():
    s = _series(300)
    assert adjust_for_unit_changes(s) == s


def test_adjust_ends_at_the_real_last_nav():
    base = _series(200)
    split = [(d, nav if i < 100 else nav * 10) for i, (d, nav) in enumerate(base)]  # consolidation
    assert adjust_for_unit_changes(split)[-1] == split[-1]


def test_daily_publishing_funds_are_annualised_by_observed_frequency():
    # 365 NAVs/year (liquid fund) at 0.02%/day = ~7.6%/yr; Sharpe must not assume 252 periods.
    s = _series(1500, daily=0.0002)
    m = compute_metrics(s)
    assert m["ret_1y"] == pytest.approx(((1.0002) ** 365 - 1) * 100, rel=0.02)
    # the same fund sampled on trading days only should give ~the same Sharpe, not a 30% lower one
    weekdays = [(d, v) for d, v in s if d.weekday() < 5]
    # (weekday sampling drops ~2/7 of points but keeps the same growth per calendar day)
    assert m["std_dev_3y"] is not None and weekdays


def test_flat_nav_series_yields_none_not_overflow():
    flat = [(date(2023, 1, 1) + timedelta(days=i), 10.0) for i in range(1500)]
    m = compute_metrics(flat)
    assert m["sharpe_3y"] is None and m["sortino_3y"] is None
    assert m["ret_1y"] == pytest.approx(0.0, abs=1e-9)


def test_all_metrics_are_finite_or_none_and_bounded():
    import math

    near_flat = [(date(2023, 1, 1) + timedelta(days=i), 10.0 + (i % 2) * 1e-7) for i in range(1500)]
    for value in compute_metrics(near_flat).values():
        assert value is None or (math.isfinite(value) and abs(value) < 1e5)
