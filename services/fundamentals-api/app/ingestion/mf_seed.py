"""The local seed loop (issue #222): fill every fund's NAV history in slices.

The stock screener is filled locally by running the hosted jobs against your own
Postgres; funds work the same way, and `drain` is what makes the slow part, ~1,800
paced mfapi.in fetches, one resumable command. It is pure (the queue and the work are
passed in) so it tests offline.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable

NextCodes = Callable[[int], Awaitable[list[int]]]
Process = Callable[[list[int]], Awaitable[int]]


async def drain(
    next_codes: NextCodes,
    process: Process,
    *,
    budget_s: float | None,
    clock: Callable[[], float] = time.monotonic,
) -> dict:
    """Work through the queue slice by slice until it is empty or the time budget is spent.

    `next_codes(after)` returns the next slice of scheme codes above the cursor (ascending);
    `process(codes)` returns how many of them were fetched. The cursor only moves forward, so
    a scheme whose fetch fails is skipped for the rest of this run (and stays queued for the
    next) instead of being retried in a loop. The budget is checked between slices, so a slice
    that has started always finishes.
    """
    started = clock()
    cursor = slices = schemes = fetched = 0
    stopped = "done"
    while True:
        if budget_s is not None and clock() - started >= budget_s:
            stopped = "budget"
            break
        codes = await next_codes(cursor)
        if not codes:
            break
        got = await process(codes)
        slices += 1
        schemes += len(codes)
        fetched += got
        cursor = max(codes)
    return {"slices": slices, "schemes": schemes, "fetched": fetched, "failed": schemes - fetched, "stopped": stopped}
