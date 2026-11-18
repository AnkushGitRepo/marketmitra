"""Pure mutual fund performance/risk maths over a NAV series (ADR 0067).

A series is a list of ``(date, nav)`` sorted ascending. Nothing here touches
the network or the database. Returns under one year are absolute; one year and
over are annualised (CAGR). Risk figures use daily NAV returns over a 3-year
window and a fixed risk-free rate, so every fund is judged the same way.
"""

from __future__ import annotations

import math
from bisect import bisect_right
from datetime import date, timedelta
from itertools import pairwise

Series = list[tuple[date, float]]

RISK_FREE_RATE = 0.065  # annual, approximates the Indian 91-day T-bill yield
MIN_VOLATILITY = 1e-4  # annualised; below this a series is flat and Sharpe is meaningless
MAX_ABS_METRIC = 1e5  # column is Numeric(10,4); anything near this is a data artefact
RETURN_PERIODS_MONTHS: dict[str, int] = {
    "ret_1m": 1, "ret_3m": 3, "ret_6m": 6,
    "ret_1y": 12, "ret_3y": 36, "ret_5y": 60, "ret_10y": 120,
}
# A fund's NAV does not move this much in a day. Such a jump is a unit split or
# consolidation (ETFs do both), which would otherwise read as a crash or a rally.
UNIT_CHANGE_THRESHOLD = 0.40
RISK_WINDOW_YEARS = 3
MIN_RISK_POINTS = 200


def _months_ago(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) - months
    year, month = divmod(total, 12)
    month += 1
    last_day = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


def adjust_for_unit_changes(series: Series) -> Series:
    """Remove unit splits/consolidations: a single-day move beyond the threshold
    is treated as no return that day, and the series is rebuilt from the cleaned
    daily returns, scaled to finish at the real last NAV. A series with no such
    jump is returned unchanged."""
    if len(series) < 2:
        return series
    ratios = [b / a if a > 0 else 1.0 for (_, a), (_, b) in pairwise(series)]
    if all(abs(r - 1) <= UNIT_CHANGE_THRESHOLD for r in ratios):
        return series
    index = [1.0]
    for r in ratios:
        index.append(index[-1] * (1.0 if abs(r - 1) > UNIT_CHANGE_THRESHOLD else r))
    scale = series[-1][1] / index[-1]
    return [(d, v * scale) for (d, _), v in zip(series, index, strict=True)]


def nav_on_or_before(series: Series, target: date) -> float | None:
    idx = bisect_right(series, target, key=lambda point: point[0])
    return series[idx - 1][1] if idx else None


def period_return(series: Series, months: int) -> float | None:
    """Percent return over the trailing window; CAGR when the window is >= 12 months."""
    if len(series) < 2:
        return None
    end_date, end_nav = series[-1]
    start_date = _months_ago(end_date, months)
    if series[0][0] > start_date:
        return None  # fund is younger than the window
    start_nav = nav_on_or_before(series, start_date)
    if not start_nav or start_nav <= 0:
        return None
    growth = end_nav / start_nav
    if months >= 12:
        return (growth ** (12 / months) - 1) * 100
    return (growth - 1) * 100


def max_drawdown(series: Series) -> float | None:
    """Worst peak-to-trough fall, as a negative percent."""
    if len(series) < 2:
        return None
    peak, worst = series[0][1], 0.0
    for _, nav in series:
        peak = max(peak, nav)
        worst = min(worst, nav / peak - 1)
    return worst * 100


def _daily_returns(series: Series) -> list[float]:
    return [b / a - 1 for (_, a), (_, b) in pairwise(series) if a > 0]


def _risk_stats(window: Series) -> dict[str, float | None]:
    rets = _daily_returns(window)
    span_years = (window[-1][0] - window[0][0]).days / 365.25
    if len(rets) < MIN_RISK_POINTS or span_years <= 0:
        return {"std_dev_3y": None, "sharpe_3y": None, "sortino_3y": None}
    # Funds publish between ~250 (equity) and ~365 (liquid/debt) NAVs a year, so the
    # annualisation factor comes from the data rather than a fixed 252.
    periods = len(rets) / span_years
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    vol = math.sqrt(var) * math.sqrt(periods)
    ann_ret = (1 + mean) ** periods - 1
    daily_rf = RISK_FREE_RATE / periods
    downside = [min(0.0, r - daily_rf) for r in rets]
    down_dev = math.sqrt(sum(x * x for x in downside) / len(rets)) * math.sqrt(periods)
    return {
        "std_dev_3y": vol * 100,
        "sharpe_3y": (ann_ret - RISK_FREE_RATE) / vol if vol > MIN_VOLATILITY else None,
        "sortino_3y": (ann_ret - RISK_FREE_RATE) / down_dev
        if vol > MIN_VOLATILITY and down_dev > MIN_VOLATILITY
        else None,
    }


def _sane(value: float | None) -> float | None:
    """None for NaN/inf or a value too large to store; never raises downstream."""
    return value if value is not None and math.isfinite(value) and abs(value) < MAX_ABS_METRIC else None


def sip_xirr(series: Series, years: int, monthly_amount: float = 10_000.0) -> float | None:
    """Annualised XIRR (percent) of a monthly SIP over the trailing `years`."""
    if len(series) < 2:
        return None
    end_date, end_nav = series[-1]
    start_date = _months_ago(end_date, years * 12)
    if series[0][0] > start_date:
        return None
    flows: list[tuple[date, float]] = []
    units = 0.0
    for i in range(years * 12):
        when = _months_ago(end_date, years * 12 - i)
        nav = nav_on_or_before(series, when)
        if not nav:
            return None
        units += monthly_amount / nav
        flows.append((when, -monthly_amount))
    flows.append((end_date, units * end_nav))
    t0 = flows[0][0]

    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** ((d - t0).days / 365) for d, cf in flows)

    lo, hi = -0.99, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(100):
        mid = (lo + hi) / 2
        if npv(lo) * npv(mid) <= 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2 * 100


def compute_metrics(series: Series) -> dict[str, float | None]:
    """All stored metrics for one scheme. Missing history yields None, never a guess."""
    return {key: _sane(value) for key, value in _compute(adjust_for_unit_changes(series)).items()}


def _compute(series: Series) -> dict[str, float | None]:
    out: dict[str, float | None] = {
        key: period_return(series, months) for key, months in RETURN_PERIODS_MONTHS.items()
    }
    if not series:
        return {**out, "std_dev_3y": None, "sharpe_3y": None, "sortino_3y": None,
                "max_drawdown_3y": None, "sip_xirr_3y": None, "sip_xirr_5y": None}
    cutoff = _months_ago(series[-1][0], RISK_WINDOW_YEARS * 12)
    has_history = series[0][0] <= cutoff
    window = [p for p in series if p[0] >= cutoff] if has_history else []
    return {
        **out,
        **(_risk_stats(window) if window else {"std_dev_3y": None, "sharpe_3y": None, "sortino_3y": None}),
        "max_drawdown_3y": max_drawdown(window) if window else None,
        "sip_xirr_3y": sip_xirr(series, 3),
        "sip_xirr_5y": sip_xirr(series, 5),
    }
