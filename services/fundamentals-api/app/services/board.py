"""Which listing board a query covers (ADR 0066, amending ADR 0033): the NSE main
board, the NSE SME platform, or both. Pure helpers, shared by the screener, the
company master and the stalest-first refresh."""

from __future__ import annotations

import math
from typing import Literal

Board = Literal["mainboard", "sme", "all"]
BOARDS: tuple[str, ...] = ("mainboard", "sme", "all")


def resolve_board(board: str | None, include_sme: bool) -> Board:
    """An explicit `board` wins. Without one, `include_sme` (the older flag) means
    both boards, and the default stays main-board only so existing callers see
    exactly what they saw before SME was added."""
    if board is None:
        return "all" if include_sme else "mainboard"
    if board not in BOARDS:
        raise ValueError(f"unknown board: {board!r}")
    return board  # type: ignore[return-value]


def blend_stale(mainboard: list[dict], sme: list[dict], limit: int, sme_share: float) -> list[dict]:
    """The stalest symbols to re-scrape this run, both lists already ordered
    stalest-first. SME gets at most `sme_share` of the run so a freshly added SME
    universe cannot starve the main-board refresh; when one board has nothing
    left to do, the other fills the run."""
    sme_quota = min(len(sme), math.floor(limit * sme_share))
    main_take = min(len(mainboard), limit - sme_quota)
    sme_take = min(len(sme), limit - main_take)
    return [*mainboard[:main_take], *sme[:sme_take]]


def failure_rate_exceeded(attempted: int, failed: int, threshold: float) -> bool:
    """Whether a scrape run looks broken. Judged on the main board only: Screener.in
    does not carry every SME symbol, so an SME page that is simply not there must not
    turn the nightly job red (SME failures are still reported, just not counted)."""
    return attempted > 0 and failed / attempted > threshold
