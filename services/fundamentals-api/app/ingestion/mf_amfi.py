"""AMFI `NAVAll.txt` parser — the mutual fund scheme master + latest NAV (ADR 0067).

AMFI publishes one semicolon-separated file listing every scheme with its
latest NAV. The file interleaves three kinds of lines:

  * a section header, e.g. ``Open Ended Schemes(Equity Scheme - Flexi Cap Fund)``
  * a fund-house line, e.g. ``Parag Parikh Mutual Fund``
  * a data line:  code;isin_growth;isin_reinvest;name;plan;option;nav;date

Parsing is pure (text in, rows out) so it tests against a fixture with no
network. Fetching is `fetch_navall`, kept separate.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import httpx

logger = logging.getLogger("fundamentals.mf_amfi")

NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
_USER_AGENT = "MarketMitra/2 (+https://github.com/AnkushGitRepo/marketmitra)"

_SCHEME_TYPES = {"open": "open_ended", "close": "close_ended", "interval": "interval"}
_HEADER_RE = re.compile(r"^(Open|Close|Interval)\b[^(]*\((.*)\)\s*\**\s*$", re.IGNORECASE)

# Section-group prefix -> normalised category. Checked in order.
_CATEGORY_PREFIXES: tuple[tuple[str, str], ...] = (
    ("equity", "Equity"),
    ("income/debt", "Debt"),
    ("debt", "Debt"),
    ("hybrid", "Hybrid"),
    ("solution", "Solution Oriented"),
    ("life cycle", "Solution Oriented"),
)
_SUB_ALIASES = {
    "elss- tax saver fund": "ELSS Tax Saver Fund",
    "elss - tax saver fund": "ELSS Tax Saver Fund",
    "dynamic asset allocation or balanced advantage": "Balanced Advantage Fund",
    "balanced advantage fund/ dynamic asset allocation": "Balanced Advantage Fund",
    "multi asset allocation": "Multi Asset Allocation Fund",
    "equity savings": "Equity Savings Fund",
    "other etfs": "Other ETF",
    "elss": "ELSS Tax Saver Fund",
    "fof domestic": "Fund of Funds (Domestic)",
    "fund of funds scheme (domestic)": "Fund of Funds (Domestic)",
    "fof overseas": "Fund of Funds (Overseas)",
    "fund of funds investing overseas": "Fund of Funds (Overseas)",
}
_INDEX_VARIANT_RE = re.compile(r"^(equity|debt|hybrid) funds?$", re.IGNORECASE)
# Tokens that make up the plan/option suffix of a scheme name.
_NAME_SUFFIX_RE = re.compile(
    r"^(direct|regular|growth|idcw|dividend|payout|re-?invest(ment)?|bonus|option|plan|"
    r"monthly|weekly|daily|quarterly|annual|half[- ]yearly|bi-?monthly|fortnightly)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SchemeRow:
    scheme_code: int
    name: str
    base_name: str
    fund_house: str
    scheme_type: str
    category: str
    sub_category: str | None
    plan: str  # direct | regular
    option: str  # growth | idcw | other
    isin_growth: str | None
    isin_reinvest: str | None
    nav: Decimal | None
    nav_date: date | None


def normalise_category(header: str) -> tuple[str, str | None]:
    """Section text inside the header parentheses -> (category, sub_category).

    AMFI renamed its groups over time ("Equity Scheme" / "Equity Schemes"), so
    this maps both spellings onto one set. Index funds, ETFs and fund-of-funds
    land in "Other" with the instrument type as the sub-category.
    """
    group, _, sub = (p.strip() for p in header.replace("**", "").partition(" - "))
    sub_clean = re.sub(r"\s+", " ", sub).strip() or None
    lowered_group = group.lower()
    category = next(
        (cat for prefix, cat in _CATEGORY_PREFIXES if lowered_group.startswith(prefix)), "Other"
    )
    if category == "Other" and sub_clean is None and lowered_group not in {"growth", "income", "gilt"}:
        sub_clean = re.sub(r"\s+", " ", group).strip() or None
    if lowered_group.startswith("index funds") and sub_clean:
        variant = _INDEX_VARIANT_RE.match(sub_clean)
        sub_clean = f"Index Funds - {variant.group(1).title()}" if variant else sub_clean
    if category == "Other" and sub_clean and sub_clean.lower() == re.sub(r"\s+", " ", group).lower():
        sub_clean = group
    if category == "Solution Oriented" and lowered_group.startswith("life cycle"):
        sub_clean = f"{group} - {sub_clean}" if sub_clean else group
    if sub_clean:
        sub_clean = _SUB_ALIASES.get(sub_clean.lower(), sub_clean)
    return category, sub_clean


def _derive_base_name(name: str) -> str:
    """Strip the trailing plan/option segments ("- Direct Plan - Growth")."""
    parts = [p.strip() for p in name.split(" - ")]
    while len(parts) > 1 and _NAME_SUFFIX_RE.match(parts[-1]):
        parts.pop()
    return " - ".join(parts)


def _name_tail(name: str, base_name: str) -> str:
    """The plan/option suffix of a scheme name. Fund names themselves can say
    "Growth" or "Direct" ("Axis Growth Opportunities Fund"), so they must not count."""
    return name.removeprefix(base_name)


def _plan(plan_col: str, tail: str) -> str:
    text = plan_col or tail
    return "direct" if "direct" in text.lower() else "regular"


def _option(option_col: str, tail: str) -> str:
    text = (option_col or tail).lower()
    if any(word in text for word in ("idcw", "dividend", "payout")):
        return "idcw"
    return "growth" if "growth" in text else "other"


def _parse_nav(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.strip())
    except InvalidOperation:
        return None  # "N.A." and blanks
    return value if value > 0 else None


def _parse_date(raw: str) -> date | None:
    try:
        return datetime.strptime(f"{raw.strip()} +0000", "%d-%b-%Y %z").date()
    except ValueError:
        return None


def _clean_isin(raw: str) -> str | None:
    value = raw.strip()
    return value if len(value) == 12 and value.isalnum() else None


def parse_navall(text: str) -> list[SchemeRow]:
    """Parse the whole file. Malformed lines are skipped, never fatal."""
    rows: list[SchemeRow] = []
    scheme_type, category, sub_category, fund_house = "open_ended", "Other", None, ""

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("Scheme Code"):
            continue
        header = _HEADER_RE.match(line)
        if header:
            scheme_type = _SCHEME_TYPES.get(header.group(1).lower(), "open_ended")
            category, sub_category = normalise_category(header.group(2))
            continue
        fields = [f.strip() for f in line.split(";")]
        if len(fields) < 6:
            if len(fields) == 1 and not fields[0][:1].isdigit():
                fund_house = fields[0]
            continue
        if not fields[0].isdigit():
            continue
        if len(fields) >= 8:
            isin_a, isin_b, name, plan_col, option_col, nav, nav_date = fields[1:8]
        else:  # legacy 6-column layout: code;isin;isin;name;nav;date
            isin_a, isin_b, name, nav, nav_date = fields[1:6]
            plan_col = option_col = ""
        base_name = _derive_base_name(name)
        tail = _name_tail(name, base_name)
        rows.append(
            SchemeRow(
                scheme_code=int(fields[0]),
                name=name,
                base_name=base_name,
                fund_house=fund_house,
                scheme_type=scheme_type,
                category=category,
                sub_category=sub_category,
                plan=_plan(plan_col, tail),
                option=_option(option_col, tail),
                isin_growth=_clean_isin(isin_a),
                isin_reinvest=_clean_isin(isin_b),
                nav=_parse_nav(nav),
                nav_date=_parse_date(nav_date),
            )
        )
    return rows


async def fetch_navall(client: httpx.AsyncClient | None = None) -> str:
    """Download the file. Raises on HTTP errors — the caller decides how to react."""
    owns = client is None
    client = client or httpx.AsyncClient(
        timeout=60, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
    )
    try:
        response = await client.get(NAVALL_URL)
        response.raise_for_status()
        return response.text
    finally:
        if owns:
            await client.aclose()
