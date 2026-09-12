"""Tier 3 entry point: Screener.in, fetched via httpx and parsed with
Scrapling's standalone `Selector`. See README.md in this directory for why
this is isolated and what's actually been verified.

Public entry points (the only things the rest of the ingestion pipeline
should import from this module):

- fetch_ratios(symbol)
- fetch_financial_statement(symbol, statement_type)
- fetch_shareholding(symbol)
- fetch_about(symbol)
- fetch_peers(symbol)
- fetch_annual_reports(symbol)
- fetch_screener_snapshot(symbol) — the Screener feature's bulk-ingestion
  entry point (ADR 0025). One page fetch, reusing _parse_ratios and
  _parse_financial_statement on the same page object rather than the
  per-field-separate-fetch pattern the functions above use individually —
  see its own docstring for why that distinction matters at bulk scale.

Parsing is split from fetching (`_parse_*` vs `fetch_*`) specifically so
tests can run the real parsing logic against a saved-to-disk Screener.in
page (`tests/fixtures/screener_newgen_consolidated.html`, a real page the
project maintainer saved from a browser) without any network call — see
`tests/test_tier3_scraper.py`.

**Why httpx + scrapling.parser.Selector, not scrapling.fetchers.Fetcher:**
`scrapling.fetchers` (even its plain curl_cffi-based `Fetcher`) imports
`scrapling.engines.toolbelt.convertor`, which does a hard top-level
`from playwright._impl._errors import Error` — so importing `Fetcher` at
all drags in Playwright's ~130MB bundled Node driver, which doesn't fit a
Vercel serverless function (see ADR 0013) even though nothing here ever
launches a browser. `scrapling.parser.Selector` is the same CSS/text
parsing engine `Fetcher`'s responses use under the hood, but it's a fully
separate module with no fetchers/playwright import chain — so fetching is
done directly with httpx (already a dependency) and handed to `Selector`.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

import httpx
from scrapling.parser import Selector

from app.schemas import PeriodType, StatementType

logger = logging.getLogger("fundamentals.tier3_screener")

_BASE_URL = "https://www.screener.in/company/{symbol}/consolidated/"
_MAX_RETRIES = 3
_RETRY_BACKOFF_SECONDS = 2.0
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

_STATEMENT_SECTION_IDS = {
    StatementType.PROFIT_AND_LOSS: "profit-loss",
    StatementType.BALANCE_SHEET: "balance-sheet",
    StatementType.CASH_FLOW: "cash-flow",
}

_MONTH_ABBR = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}
_PERIOD_LABEL_RE = re.compile(r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$")


async def _fetch_with_retry(symbol: str) -> Selector | None:
    url = _BASE_URL.format(symbol=symbol)
    last_error: Exception | None = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(headers=_BROWSER_HEADERS, timeout=15.0) as client:
                response = await client.get(url)
            if response.status_code == 200:
                return Selector(response.text)
            last_error = RuntimeError(f"HTTP {response.status_code}")
        except Exception as exc:  # noqa: BLE001
            last_error = exc

        logger.warning(
            "screener.in fetch for %s failed (attempt %d/%d): %s",
            symbol, attempt, _MAX_RETRIES, last_error,
        )
        if attempt < _MAX_RETRIES:
            await asyncio.sleep(_RETRY_BACKOFF_SECONDS * attempt)

    logger.error("screener.in fetch for %s failed after %d attempts: %s", symbol, _MAX_RETRIES, last_error)
    return None


def _parse_number(raw: str | None) -> Decimal | None:
    if raw is None:
        return None
    cleaned = raw.strip().replace(",", "").rstrip("%").strip()
    if not cleaned or cleaned in ("-", "N/A"):
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _period_end_for_label(label: str) -> tuple[PeriodType, date | None]:
    label = label.strip()
    if label.upper() == "TTM":
        return PeriodType.TTM, None
    match = _PERIOD_LABEL_RE.match(label)
    if not match:
        return PeriodType.ANNUAL, None
    month, year = _MONTH_ABBR[match.group(1)], int(match.group(2))
    # last day of that month, without pulling in a calendar dependency
    if month == 12:
        next_month_first = date(year + 1, 1, 1)
    else:
        next_month_first = date(year, month + 1, 1)
    period_end = date(next_month_first.year, next_month_first.month, 1) - timedelta(days=1)
    return PeriodType.ANNUAL, period_end


def _parse_ratios(page) -> list[dict]:
    """Returns [{"name": str, "value": Decimal, "unit": str | None}, ...]
    scraped from the top-ratios box (#top-ratios li .name / .number)."""
    ratios: list[dict] = []
    for li in page.css("#top-ratios li"):
        name_nodes = li.css(".name")
        name = name_nodes[0].get_all_text().strip() if name_nodes else ""
        number_text = li.css(".number::text").get()
        value = _parse_number(number_text)
        if not name or value is None:
            continue
        unit = None
        text_blob = li.get_all_text()
        if "%" in text_blob:
            unit = "%"
        elif "₹" in text_blob:
            unit = "INR"
        ratios.append({"name": name, "value": value, "unit": unit})
    return ratios


def _parse_financial_statement(page, statement_type: StatementType) -> list[dict]:
    """Returns [{"label": str, "period_type": PeriodType, "period_end": date | None,
    "value": Decimal}, ...] for the given statement's table."""
    section_id = _STATEMENT_SECTION_IDS[statement_type]
    sections = page.css(f"#{section_id}")
    if not sections:
        return []
    tables = sections[0].css("table")
    if not tables:
        return []

    rows = tables[0].css("tr")
    if len(rows) < 2:
        return []

    period_labels = [cell.get_all_text().strip() for cell in rows[0].css("th")][1:]
    periods = [_period_end_for_label(label) for label in period_labels]

    line_items: list[dict] = []
    for row in rows[1:]:
        cells = row.css("td")
        if not cells:
            continue
        label = cells[0].get_all_text().replace("\xa0", " ").strip().rstrip("+").strip()
        for (period_type, period_end), cell in zip(periods, cells[1:], strict=False):
            value = _parse_number(cell.get_all_text().strip())
            if value is None:
                continue
            line_items.append(
                {
                    "label": label,
                    "period_type": period_type,
                    "period_end": period_end,
                    "value": value,
                }
            )
    return line_items


def _parse_sector_industry(page) -> tuple[str | None, str | None]:
    """(sector, industry) from the breadcrumb line in the #peers section
    header (`a[title="Sector"]` / `a[title="Industry"]`) — this is the
    narrower of the two breadcrumb levels Screener shows (it also has a
    "Broad Sector"/"Broad Industry" pair; the narrower one is more useful
    for filtering). This breadcrumb is part of the section's static header
    markup, not the peer-comparison table itself (which fetch_peers's own
    docstring notes is sometimes AJAX-loaded) — confirmed present in the
    saved fixture regardless of whether the table rows below it are."""
    sector_nodes = page.css('#peers a[title="Sector"]')
    industry_nodes = page.css('#peers a[title="Industry"]')
    sector = sector_nodes[0].get_all_text().strip() if sector_nodes else None
    industry = industry_nodes[0].get_all_text().strip() if industry_nodes else None
    return sector or None, industry or None


def _compute_debt_to_equity(balance_sheet_items: list[dict]) -> Decimal | None:
    """Borrowings ÷ (Equity Capital + Reserves) for the most recent annual
    period. Labels confirmed against the real parser output on the test
    fixture (tests/fixtures/screener_newgen_consolidated.html, an IT
    company) — "Equity Capital", not the initially-assumed "Equity Share
    Capital". **Still only verified against one sector.** Before trusting
    this at scale, verify against 3-5 real companies spanning different
    sectors (bank, NBFC, manufacturer, real estate — the sectors most
    likely to label a balance sheet differently, e.g. banks often don't
    use "Borrowings" the way a manufacturer does); see ADR 0025's known-risk
    note. Returns None if any part is missing or equity is zero — never a
    fabricated ratio."""
    annual = [i for i in balance_sheet_items if i["period_type"] == PeriodType.ANNUAL and i["period_end"]]
    if not annual:
        return None
    latest_period = max(i["period_end"] for i in annual)
    latest = [i for i in annual if i["period_end"] == latest_period]

    def _value(label: str) -> Decimal | None:
        match = next((i["value"] for i in latest if i["label"] == label), None)
        return match

    borrowings = _value("Borrowings")
    share_capital = _value("Equity Capital")
    reserves = _value("Reserves")
    if borrowings is None or share_capital is None or reserves is None:
        return None
    equity = share_capital + reserves
    if equity == 0:
        return None
    return borrowings / equity


def _compute_cagr(pnl_items: list[dict], label: str, years: int = 3) -> Decimal | None:
    """CAGR of `label` (e.g. "Sales" or "Net Profit") over the last `years`
    annual periods: (latest / oldest) ** (1/years) - 1. None if fewer than
    `years`+1 annual data points exist, or the base (oldest) value isn't
    positive (a loss-making or zero base year makes a CAGR meaningless,
    not just arithmetically awkward — never fabricate one)."""
    points = sorted(
        (
            (i["period_end"], i["value"])
            for i in pnl_items
            if i["period_type"] == PeriodType.ANNUAL and i["period_end"] and i["label"] == label
        ),
        key=lambda p: p[0],
    )
    if len(points) < years + 1:
        return None
    oldest_value = points[-(years + 1)][1]
    latest_value = points[-1][1]
    if oldest_value <= 0:
        return None
    ratio = latest_value / oldest_value
    if ratio < 0:
        return None
    return ratio ** (Decimal(1) / Decimal(years)) - 1


def _compute_growth(pnl_items: list[dict]) -> tuple[Decimal | None, Decimal | None]:
    """(sales_growth_3y_cagr, profit_growth_3y_cagr). Screener's P&L label
    for revenue varies (\"Sales\" is the common case; some pages use
    \"Revenue\") — try both."""
    sales = _compute_cagr(pnl_items, "Sales") or _compute_cagr(pnl_items, "Revenue")
    profit = _compute_cagr(pnl_items, "Net Profit")
    return sales, profit


async def fetch_screener_snapshot(symbol: str) -> dict | None:
    """One page fetch → every field the Screener bulk-ingestion job needs
    (ADR 0025), reusing _parse_ratios/_parse_financial_statement on the
    SAME page object — deliberately not the per-field-separate-fetch
    pattern fetch_ratios/fetch_financial_statement use individually today
    (each of those re-fetches the page from scratch; fine for one company
    at a time, wasteful ×2,570 for the bulk job). Returns None only if the
    page fetch itself failed; a dict with some fields None (and
    fetch_status="partial") if the page loaded but a section didn't parse.
    """
    page = await _fetch_with_retry(symbol)
    if page is None:
        return None

    ratios = {r["name"]: r["value"] for r in _parse_ratios(page)}
    pnl = _parse_financial_statement(page, StatementType.PROFIT_AND_LOSS)
    balance_sheet = _parse_financial_statement(page, StatementType.BALANCE_SHEET)
    sector, industry = _parse_sector_industry(page)

    current_price = ratios.get("Current Price")
    book_value = ratios.get("Book Value")
    pb = (current_price / book_value) if current_price and book_value else None

    debt_to_equity = _compute_debt_to_equity(balance_sheet)
    sales_growth, profit_growth = _compute_growth(pnl)

    return {
        "sector": sector,
        "industry": industry,
        "market_cap": ratios.get("Market Cap"),
        "current_price": current_price,
        "pe": ratios.get("Stock P/E"),
        "book_value": book_value,
        "pb": pb,
        "dividend_yield": ratios.get("Dividend Yield"),
        "roce": ratios.get("ROCE"),
        "roe": ratios.get("ROE"),
        "face_value": ratios.get("Face Value"),
        "debt_to_equity": debt_to_equity,
        "sales_growth_3y_cagr": sales_growth,
        "profit_growth_3y_cagr": profit_growth,
        # "partial" whenever the balance sheet didn't yield a D/E, since
        # that's the field most likely to be missing/mislabeled per-sector —
        # not a blanket "everything parsed" claim.
        "fetch_status": "ok" if debt_to_equity is not None else "partial",
    }


def _parse_shareholding(page) -> list[dict]:
    """Returns [{"category": str, "quarter_end": date | None, "percentage": Decimal}, ...]
    — one entry per (category, quarter) so callers can chart the full
    history Screener shows (five quarters), not just the latest one."""
    sections = page.css("#shareholding")
    if not sections:
        return []
    tables = sections[0].css("table")
    if not tables:
        return []

    rows = tables[0].css("tr")
    if len(rows) < 2:
        return []

    period_labels = [cell.get_all_text().strip() for cell in rows[0].css("th")][1:]
    periods = [_period_end_for_label(label)[1] for label in period_labels]

    entries: list[dict] = []
    for row in rows[1:]:
        cells = row.css("td")
        if not cells:
            continue
        category = cells[0].get_all_text().replace("\xa0", " ").strip().rstrip("+").strip()
        if category.lower() == "no. of shareholders":
            continue  # a shareholder count, not an ownership category — not a ShareholdingEntry
        for period_end, cell in zip(periods, cells[1:], strict=False):
            if period_end is None:
                continue
            value = _parse_number(cell.get_all_text().strip())
            if value is not None:
                entries.append(
                    {"category": category, "quarter_end": period_end, "percentage": value}
                )
    return entries


def _parse_about(page) -> str | None:
    """Returns the company's business-description paragraph from Screener's
    About section, or None if the markup isn't present."""
    about_div = page.css(".company-profile .about")
    if not about_div:
        return None
    text = about_div[0].get_all_text().strip()
    return text or None


_PEER_LINK_RE = re.compile(r"/company/([^/]+)/")


def _parse_peer_rows(table_container, target_symbol: str) -> list[dict]:
    """Shared row-parsing logic for a `#peers table` — used both for the
    inline server-rendered case and the AJAX fragment fetched separately
    for companies where Screener lazy-loads this table (see fetch_peers)."""
    tables = table_container.css("table")
    if not tables:
        return []

    rows = tables[0].css("tbody tr[data-row-company-id]")
    peers: list[dict] = []
    for row in rows:
        cells = row.css("td")
        if len(cells) < 11:
            continue
        links = cells[1].css("a")
        if not links:
            continue
        href = links[0].attrib.get("href", "")
        match = _PEER_LINK_RE.search(href)
        if not match:
            continue
        symbol = match.group(1).upper()
        name = links[0].get_all_text().strip()
        values = [_parse_number(c.get_all_text().strip()) for c in cells[2:11]]
        peers.append({
            "symbol": symbol,
            "name": name,
            "is_target": symbol == target_symbol.upper(),
            "cmp": values[0],
            "pe": values[1],
            "market_cap": values[2],
            "div_yield": values[3],
            "net_profit_qtr": values[4],
            "qtr_profit_var_pct": values[5],
            "sales_qtr": values[6],
            "qtr_sales_var_pct": values[7],
            "roce_pct": values[8],
        })
    return peers


def _parse_peers(page, target_symbol: str) -> list[dict]:
    """Returns [{"symbol", "name", "is_target", "cmp", "pe", "market_cap",
    "div_yield", "net_profit_qtr", "qtr_profit_var_pct", "sales_qtr",
    "qtr_sales_var_pct", "roce_pct"}, ...] from Screener's #peers table —
    one row per peer, including the company itself (flagged `is_target`).
    Empty if the table is lazy-loaded rather than server-rendered inline
    (see fetch_peers, which handles that case with a follow-up request)."""
    sections = page.css("#peers")
    if not sections:
        return []
    return _parse_peer_rows(sections[0], target_symbol)


def _parse_warehouse_id(page) -> str | None:
    """Screener's internal numeric "warehouse id" — distinct from both the
    NSE/BSE symbol and `data-company-id` (a separate id used for other
    endpoints, e.g. `/company/{id}/schedules/`) — is what the peers AJAX
    endpoint is actually keyed by. Confirmed by reading Screener's own
    `company.customisation.js`: `loadPeersTable(warehouseId)` builds
    `/api/company/{warehouseId}/peers/`. Guessing `data-company-id` first
    seemed to work for one company (Reliance) purely by numeric-range
    coincidence and 404'd for two others (TCS, Newgen) — this is the real
    fix, not the coincidence."""
    info_div = page.css("#company-info")
    if not info_div:
        return None
    return info_div[0].attrib.get("data-warehouse-id")


_ANNUAL_REPORT_YEAR_RE = re.compile(r"(\d{4})\s*$")


def _parse_annual_reports(page) -> list[dict]:
    """Returns [{"title", "url", "period_end"}, ...] from Screener's
    Documents → Annual reports list — these link directly to BSE-hosted
    PDFs, so no separate Tier 1 filing-URL discovery step is needed for
    this specific document type."""
    links = page.css(".annual-reports ul.list-links li a")
    reports: list[dict] = []
    for link in links:
        href = link.attrib.get("href")
        if not href:
            continue
        title = link.get_all_text().strip().split("\n")[0].strip()
        year_match = _ANNUAL_REPORT_YEAR_RE.search(title)
        period_end = date(int(year_match.group(1)), 3, 31) if year_match else None
        reports.append({"title": title, "url": href, "period_end": period_end})
    return reports


async def fetch_ratios(symbol: str) -> list[dict]:
    page = await _fetch_with_retry(symbol)
    if page is None:
        return []
    ratios = _parse_ratios(page)
    if not ratios:
        logger.warning("screener.in ratios for %s parsed to zero entries — markup may have changed", symbol)
    return ratios


async def fetch_financial_statement(symbol: str, statement_type: StatementType) -> list[dict]:
    page = await _fetch_with_retry(symbol)
    if page is None:
        return []
    line_items = _parse_financial_statement(page, statement_type)
    if not line_items:
        logger.warning(
            "screener.in %s table for %s parsed to zero line items — markup may have changed",
            statement_type, symbol,
        )
    return line_items


async def fetch_shareholding(symbol: str) -> list[dict]:
    page = await _fetch_with_retry(symbol)
    if page is None:
        return []
    entries = _parse_shareholding(page)
    if not entries:
        logger.warning(
            "screener.in shareholding for %s parsed to zero entries — markup may have changed", symbol
        )
    return entries


async def fetch_about(symbol: str) -> str | None:
    page = await _fetch_with_retry(symbol)
    if page is None:
        return None
    about = _parse_about(page)
    if about is None:
        logger.warning("screener.in about section for %s not found — markup may have changed", symbol)
    return about


async def fetch_peers(symbol: str) -> list[dict]:
    """Fetches the peer-comparison table. Screener lazy-loads this table via
    AJAX (a `Loading peers table ...` placeholder, filled in client-side)
    far more often than server-rendering it inline — true for large caps
    (Reliance, TCS) and even a mid-cap (Newgen) whose page used to render it
    inline when this module's test fixture was saved. This falls back to
    that request whenever the inline parse comes up empty, keyed by
    Screener's "warehouse id" (see _parse_warehouse_id) — confirmed working
    for all three of the above once the correct id was used."""
    page = await _fetch_with_retry(symbol)
    if page is None:
        return []

    peers = _parse_peers(page, symbol)
    if not peers:
        warehouse_id = _parse_warehouse_id(page)
        if warehouse_id:
            peers = await _fetch_peers_via_ajax(warehouse_id, symbol)

    if not peers:
        logger.warning("screener.in peer comparison for %s parsed to zero rows — markup may have changed", symbol)
    return peers


async def _fetch_peers_via_ajax(warehouse_id: str, target_symbol: str) -> list[dict]:
    url = f"https://www.screener.in/api/company/{warehouse_id}/peers/"
    try:
        async with httpx.AsyncClient(headers=_BROWSER_HEADERS, timeout=15.0) as client:
            response = await client.get(url)
        if response.status_code != 200:
            return []
    except Exception as exc:  # noqa: BLE001
        logger.warning("screener.in AJAX peers fetch for warehouse_id=%s failed: %s", warehouse_id, exc)
        return []
    return _parse_peer_rows(Selector(response.text), target_symbol)


async def fetch_annual_reports(symbol: str) -> list[dict]:
    page = await _fetch_with_retry(symbol)
    if page is None:
        return []
    reports = _parse_annual_reports(page)
    if not reports:
        logger.warning("screener.in annual reports for %s parsed to zero entries — markup may have changed", symbol)
    return reports
