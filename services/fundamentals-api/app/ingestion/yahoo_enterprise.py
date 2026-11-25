"""Cash, debt and enterprise value from Yahoo Finance (#365).

The research report needs net debt and EV/EBITDA, and neither Screener nor the NSE/BSE filings give a cash line the
service already stores. Yahoo's balance sheet has ``Total Debt`` and ``Cash Cash Equivalents And Short Term
Investments`` by year, and its quote summary carries the current enterprise value, cash, debt and EBITDA. Yahoo
reports in rupees; everything here is stored in ₹ crore like the rest of the financials.

Pure functions over plain dicts (the fetch in ``tier2_yfinance`` turns Yahoo's DataFrame into them), so they test
without pandas or a network.

EV and EBITDA mean nothing for a bank or an NBFC (deposits and loans are the business, not debt), so lenders get no
enterprise figures rather than a misleading multiple.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import date
from decimal import Decimal
from typing import Final

CASH_LABEL: Final = "Cash and Short-Term Investments"
DEBT_LABEL: Final = "Total Debt"

_RUPEES_PER_CRORE: Final = Decimal(10_000_000)
_PAISA: Final = Decimal("0.01")
_CASH_ROWS: Final = ("Cash Cash Equivalents And Short Term Investments", "Cash And Cash Equivalents")
_LENDER_SECTORS: Final = frozenset({"financial services"})


def is_lender(sector: str | None) -> bool:
    """True for banks, NBFCs and insurers, where EV/EBITDA is not meaningful."""
    return sector is not None and sector.strip().lower() in _LENDER_SECTORS


def _crore(value: object) -> Decimal | None:
    """A rupee amount as ₹ crore to the paisa; None for a missing, NaN or non-numeric value."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    try:
        return (Decimal(str(value)) / _RUPEES_PER_CRORE).quantize(_PAISA)
    except Exception:  # noqa: BLE001
        return None


def _series(rows: Mapping[str, Mapping[date, object]], names: tuple[str, ...]) -> Mapping[date, object]:
    """The first of ``names`` that has any figure, so a fallback row is used only when the preferred one is empty."""
    for name in names:
        series = rows.get(name) or {}
        if any(_crore(v) is not None for v in series.values()):
            return series
    return {}


def balance_sheet_items(rows: Mapping[str, Mapping[date, object]]) -> list[dict]:
    """Annual ``Total Debt`` and ``Cash and Short-Term Investments`` line items, in ₹ crore."""
    items: list[dict] = []
    for label, names in ((DEBT_LABEL, ("Total Debt",)), (CASH_LABEL, _CASH_ROWS)):
        for period_end, raw in _series(rows, names).items():
            value = _crore(raw)
            if value is not None:
                items.append({"label": label, "period_type": "annual", "period_end": period_end, "value": value})
    return items


def enterprise_ratios(info: Mapping[str, object], sector: str | None) -> list[dict]:
    """Current enterprise value, cash, debt, net debt, EBITDA and EV/EBITDA as ratio rows.

    Empty for a lender, and for a report in any currency but rupees (a mislabelled figure is worse than none)."""
    if is_lender(sector) or info.get("financialCurrency") != "INR":
        return []
    ev, cash, debt, ebitda = (_crore(info.get(k)) for k in ("enterpriseValue", "totalCash", "totalDebt", "ebitda"))
    net_debt = debt - cash if debt is not None and cash is not None else None
    rows: list[tuple[str, Decimal | None, str]] = [
        ("Enterprise Value", ev, "INR_CR"),
        ("Total Cash", cash, "INR_CR"),
        ("Total Debt (latest)", debt, "INR_CR"),
        ("Net Debt", net_debt, "INR_CR"),
        ("EBITDA (TTM)", ebitda, "INR_CR"),
    ]
    if ev is not None and ebitda is not None and ebitda > 0:
        rows.append(("EV/EBITDA", (ev / ebitda).quantize(_PAISA), "x"))
    return [{"name": name, "value": value, "unit": unit} for name, value, unit in rows if value is not None]
