"""The fallback-chain orchestrator.

This is deliberately generic: it does not pick one tier per *data type* in
advance. It tries Tier 1 first for a set of named fields, and only asks
Tier 2 / Tier 3 for whichever specific fields Tier 1 didn't return — so a
single logical "get me this company's fundamentals" call can end up with
some fields from Tier 1, some from Tier 2, and some from Tier 3, each
tagged with the tier that actually produced it.

A "resolver" is any zero-argument async callable that returns a dict of
{field_name: value}. It should only include keys for fields it actually
found — omitting a key (or returning None for it) means "didn't have it,
try the next tier."
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from app.schemas import SourceTier
from app.security import log_safe

logger = logging.getLogger("fundamentals.orchestrator")

Resolver = Callable[[], Awaitable[dict[str, object]]]


@dataclass
class TieredResolver:
    tier: SourceTier
    resolve: Resolver
    label: str = ""


@dataclass
class FallbackResult:
    values: dict[str, object] = field(default_factory=dict)
    source_tiers: dict[str, SourceTier] = field(default_factory=dict)
    errors: dict[SourceTier, str] = field(default_factory=dict)

    def tier_for(self, field_name: str) -> SourceTier | None:
        return self.source_tiers.get(field_name)


async def resolve_with_fallback(
    wanted_fields: set[str],
    resolvers: list[TieredResolver],
    context_label: str = "",
) -> FallbackResult:
    """Try each resolver in order, only asking later tiers for fields still
    missing after earlier tiers ran. Returns every field found, tagged with
    the tier that actually produced it.
    """
    result = FallbackResult()
    remaining = set(wanted_fields)

    for tiered in resolvers:
        if not remaining:
            break
        try:
            found = await tiered.resolve()
        except Exception as exc:  # noqa: BLE001 — a broken tier must not break the chain
            logger.warning(
                "tier=%s label=%s context=%s failed: %s",
                tiered.tier, log_safe(tiered.label), log_safe(context_label), log_safe(exc),
            )
            result.errors[tiered.tier] = str(exc)
            continue

        served_this_tier: list[str] = []
        for key, value in found.items():
            if key in remaining and value is not None:
                result.values[key] = value
                result.source_tiers[key] = tiered.tier
                served_this_tier.append(key)

        remaining -= set(served_this_tier)

        if served_this_tier:
            logger.info(
                "tier=%s label=%s context=%s served=%s",
                tiered.tier, log_safe(tiered.label), log_safe(context_label), log_safe(sorted(served_this_tier)),
            )

    if remaining:
        logger.warning(
            "context=%s unresolved after all tiers: %s", log_safe(context_label), log_safe(sorted(remaining))
        )

    return result
