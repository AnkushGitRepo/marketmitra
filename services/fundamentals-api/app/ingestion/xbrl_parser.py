"""Generic XBRL instance-document parser for NSE/BSE quarterly result filings.

**Honest limitation, stated plainly rather than glossed over:** the fact
*extraction* mechanics below (walking the instance document, pulling every
tagged, `contextRef`-bearing numeric fact by its element local-name) are
real and were tested against a hand-built fixture matching the real
Ind-AS/XBRL structure NSE/BSE filings use (see
`tests/fixtures/sample_xbrl_result.xml` and `tests/test_xbrl_parser.py`).

The `TAXONOMY_TAG_MAP` below — which maps taxonomy element names to our
`FinancialLineItem` labels — is a best-effort starting set of the tag names
most commonly seen in Ind-AS Capital Markets taxonomy filings. It has *not*
been validated against a real downloaded filing, because NSE blocked this
project's dev environment at the network edge before any filing could be
fetched (see `tier1_nse_bse.py`'s module docstring). Any tag this map
doesn't recognize is still returned, under `raw_tags`, so nothing is
silently dropped — but before trusting the mapped fields in production,
run this against a handful of real filings and correct the map.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from lxml import etree

from app.schemas import StatementType

# element local-name -> (statement_type, our line-item label)
# Best-effort starting set — see module docstring.
TAXONOMY_TAG_MAP: dict[str, tuple[StatementType, str]] = {
    # Profit & Loss
    "RevenueFromOperations": (StatementType.PROFIT_AND_LOSS, "Revenue from Operations"),
    "OtherIncome": (StatementType.PROFIT_AND_LOSS, "Other Income"),
    "TotalIncome": (StatementType.PROFIT_AND_LOSS, "Total Income"),
    "TotalExpenses": (StatementType.PROFIT_AND_LOSS, "Total Expenses"),
    "ProfitBeforeExceptionalItemsAndTax": (
        StatementType.PROFIT_AND_LOSS, "Profit Before Exceptional Items and Tax",
    ),
    # Sentence-case to match Screener.in's own scraped label exactly — the
    # line-item table groups rows by an exact label string match, and this
    # is unambiguously the same figure Screener already reports, just under
    # a differently-cased row (unlike e.g. Tax Expense/Total Income below,
    # which have no confirmed Screener equivalent and are left distinct).
    "ProfitBeforeTax": (StatementType.PROFIT_AND_LOSS, "Profit before tax"),
    "TaxExpense": (StatementType.PROFIT_AND_LOSS, "Tax Expense"),
    "ProfitLossForPeriod": (StatementType.PROFIT_AND_LOSS, "Net Profit"),
    "EarningsPerShareBasic": (StatementType.PROFIT_AND_LOSS, "EPS (Basic)"),
    "EarningsPerShareDiluted": (StatementType.PROFIT_AND_LOSS, "EPS (Diluted)"),
    # Balance Sheet
    "TotalAssets": (StatementType.BALANCE_SHEET, "Total Assets"),
    "TotalEquity": (StatementType.BALANCE_SHEET, "Total Equity"),
    "TotalLiabilities": (StatementType.BALANCE_SHEET, "Total Liabilities"),
    "TotalNonCurrentAssets": (StatementType.BALANCE_SHEET, "Total Non-Current Assets"),
    "TotalCurrentAssets": (StatementType.BALANCE_SHEET, "Total Current Assets"),
    "TotalNonCurrentLiabilities": (
        StatementType.BALANCE_SHEET, "Total Non-Current Liabilities",
    ),
    "TotalCurrentLiabilities": (StatementType.BALANCE_SHEET, "Total Current Liabilities"),
    "CashAndCashEquivalents": (StatementType.BALANCE_SHEET, "Cash and Cash Equivalents"),
    # Cash Flow
    "CashFlowsFromUsedInOperatingActivities": (
        StatementType.CASH_FLOW, "Net Cash from Operating Activities",
    ),
    "CashFlowsFromUsedInInvestingActivities": (
        StatementType.CASH_FLOW, "Net Cash from Investing Activities",
    ),
    "CashFlowsFromUsedInFinancingActivities": (
        StatementType.CASH_FLOW, "Net Cash from Financing Activities",
    ),
    "NetIncreaseDecreaseInCashAndCashEquivalents": (
        StatementType.CASH_FLOW, "Net Increase/Decrease in Cash",
    ),
}


def _local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def extract_facts(xml_bytes: bytes) -> dict[str, Decimal]:
    """Walk an XBRL instance document and return every numeric, tagged
    (contextRef-bearing) fact as {element_local_name: Decimal}.

    Facts with duplicate local names keep the last occurrence — quarterly
    result XBRL typically reports the same tag under multiple contexts
    (current period, year-ago period, YTD); callers that need a specific
    context should query by contextRef directly rather than use this
    convenience view.
    """
    root = etree.fromstring(xml_bytes)
    facts: dict[str, Decimal] = {}

    for element in root.iter():
        if element.get("contextRef") is None:
            continue
        if element.text is None or not element.text.strip():
            continue
        try:
            value = Decimal(element.text.strip())
        except InvalidOperation:
            continue
        facts[_local_name(element.tag)] = value

    return facts


_CRORE = Decimal(10_000_000)

# Per-share figures, not monetary aggregates — never divided into crore.
_UNSCALED_LABELS = {"EPS (Basic)", "EPS (Diluted)"}


def map_facts_to_line_items(
    facts: dict[str, Decimal],
) -> tuple[list[dict], dict[str, Decimal]]:
    """Split extracted facts into recognized line items (statement_type +
    label + value) and everything else (raw_tags, untouched).

    Ind-AS/XBRL instance documents report monetary facts in absolute rupees
    (the `decimals` attribute is a rounding precision, not a scale factor) —
    but every other source feeding this table (Tier 3's Screener.in scrape)
    already reports in crore, and the UI formats every stored value as if
    it already were. Left unconverted, a Tier 1 XBRL-sourced quarter shows
    values ~1 crore too large next to the surrounding Tier 3 annual columns.
    """
    line_items: list[dict] = []
    raw_tags = dict(facts)

    for tag, value in facts.items():
        mapping = TAXONOMY_TAG_MAP.get(tag)
        if mapping is None:
            continue
        statement_type, label = mapping
        scaled = value if label in _UNSCALED_LABELS else value / _CRORE
        line_items.append({"statement_type": statement_type, "label": label, "value": scaled})
        raw_tags.pop(tag, None)

    return line_items, raw_tags
