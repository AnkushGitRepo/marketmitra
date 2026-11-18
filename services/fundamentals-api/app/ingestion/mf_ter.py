"""Expense ratios (TER) from the community TER tracker (ADR 0067).

captn3m0/india-mutual-fund-ter-tracker (MIT) republishes AMFI's TER disclosure
as one CSV, refreshed several times a day. It is keyed by NSDL scheme code and
scheme name, not AMFI scheme code, so rows are matched to our schemes by name.
The match is deliberately conservative: an unmatched or ambiguous row leaves a
fund's expense ratio empty rather than guessing, and an empty figure is shown
as "not available", never zero.

Parsing and matching are pure (text/rows in, rows out) so they test offline.
"""

from __future__ import annotations

import csv
import io
import logging
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime

import httpx

logger = logging.getLogger("fundamentals.mf_ter")

TER_CSV_URL = "https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/main/data.csv"
TER_COMMITS_URL = (
    "https://api.github.com/repos/captn3m0/india-mutual-fund-ter-tracker/commits?path=data.csv&per_page=1"
)
SOURCE_LABEL = "AMFI TER via community tracker"  # shown on the fund page; fits mf_factsheet.source
_USER_AGENT = "MarketMitra/2 (+https://github.com/AnkushGitRepo/marketmitra)"
MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_TER_PERCENT = 4.0  # real figures reach ~3.96 (small AMCs, Regular plans); the 20-odd rows above 4 are source errors
UNMATCHED_SAMPLE = 10

_REGULAR_COL = "Regular Plan - Total TER (%)"
_DIRECT_COL = "Direct Plan - Total TER (%)"
_NAME_COL = "Scheme Name"


@dataclass(frozen=True)
class TerRow:
    name: str
    regular: float | None
    direct: float | None


@dataclass(frozen=True)
class SchemeRef:
    """The few scheme fields matching needs (active schemes only)."""

    scheme_code: int
    base_name: str
    fund_house: str
    plan: str
    option: str
    sub_category: str | None


def normalise_name(name: str) -> str:
    text = name.lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text)).strip()


def _percent(raw: str | None) -> float | None:
    """A real expense ratio is above 0 and at most MAX_TER_PERCENT; anything else is "no figure"."""
    try:
        value = float((raw or "").strip())
    except ValueError:
        return None
    return value if math.isfinite(value) and 0 < value <= MAX_TER_PERCENT else None


def parse_ter_csv(text: str) -> tuple[list[TerRow], dict[str, int]]:
    """CSV -> usable rows. A name that appears twice is ambiguous, so every row
    carrying it is dropped. Raises ValueError if the file's columns changed."""
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in (_NAME_COL, _REGULAR_COL, _DIRECT_COL) if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"TER file is missing column(s): {', '.join(missing)} (Total TER format changed?)")

    parsed: list[TerRow] = []
    skipped = 0
    for record in reader:
        name = (record.get(_NAME_COL) or "").strip()
        if not name:
            skipped += 1
            continue
        parsed.append(TerRow(name, _percent(record.get(_REGULAR_COL)), _percent(record.get(_DIRECT_COL))))

    counts = Counter(normalise_name(r.name) for r in parsed)
    ambiguous = {key for key, n in counts.items() if n > 1}
    rows = [r for r in parsed if normalise_name(r.name) not in ambiguous]
    return rows, {"rows": len(rows), "skipped": skipped, "ambiguous_names": len(ambiguous)}


def _is_etf(scheme: SchemeRef) -> bool:
    return bool(scheme.sub_category and scheme.sub_category.lower().endswith("etf"))


def match_ter(rows: list[TerRow], schemes: list[SchemeRef]) -> tuple[dict[int, float], dict]:
    """TER rows x active schemes -> {scheme_code: expense_ratio}.

    A fund's TER applies to every scheme of that plan (Growth and each IDCW
    variant, including more than one code for the same fund). The same name under
    two different fund houses is ambiguous and nothing is filled. An ETF has a single plan, which the file lists under
    "Regular", so an ETF with no figure for its own plan uses the other column.
    """
    by_name: dict[str, list[SchemeRef]] = defaultdict(list)
    for scheme in schemes:
        by_name[normalise_name(scheme.base_name)].append(scheme)

    assigned: dict[int, float] = {}
    matched = ambiguous = 0
    unmatched: list[str] = []

    for row in rows:
        candidates = by_name.get(normalise_name(row.name))
        if not candidates:
            unmatched.append(row.name)
            continue
        matched += 1
        if len({s.fund_house for s in candidates}) > 1:
            ambiguous += len(candidates)
            continue
        for plan in ("direct", "regular"):
            for scheme in (s for s in candidates if s.plan == plan):
                own = row.direct if plan == "direct" else row.regular
                value = own if own is not None else (row.regular if _is_etf(scheme) else None)
                if value is not None:
                    assigned[scheme.scheme_code] = value

    return assigned, {
        "matched_rows": matched,
        "unmatched_rows": len(unmatched),
        "unmatched_sample": unmatched[:UNMATCHED_SAMPLE],
        "ambiguous_schemes": ambiguous,
        "schemes_filled": len(assigned),
    }


async def fetch_ter_csv(client: httpx.AsyncClient) -> str:
    """Download the CSV (size-capped). Raises on HTTP errors or an oversized body."""
    async with client.stream("GET", TER_CSV_URL, timeout=60) as response:
        response.raise_for_status()
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body.extend(chunk)
            if len(body) > MAX_CSV_BYTES:
                raise ValueError("TER file is larger than expected; refusing to read it")
    return body.decode("utf-8")


async def fetch_ter_as_of(client: httpx.AsyncClient) -> date:
    """When the tracker last updated the file (its latest commit); today if that can't be read."""
    try:
        response = await client.get(TER_COMMITS_URL, timeout=30, headers={"Accept": "application/vnd.github+json"})
        response.raise_for_status()
        stamp = response.json()[0]["commit"]["committer"]["date"]
        return datetime.fromisoformat(stamp).date()
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
        logger.warning("could not read TER file date, using today: %s", exc)
        return datetime.now(tz=UTC).date()


def make_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}, follow_redirects=True)
