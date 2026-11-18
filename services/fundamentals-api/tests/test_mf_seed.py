"""The local seed loop (issue #222): drain the backfill queue in slices.

Pure and offline: the queue and the work are injected, the clock is fake.
"""

import pytest

from app.ingestion.mf_seed import drain


class FakeQueue:
    """A queue of scheme codes served in ascending slices after a cursor, like the real endpoint."""

    def __init__(self, codes: list[int], slice_size: int = 3):
        self.codes = sorted(codes)
        self.slice_size = slice_size
        self.asked_after: list[int] = []

    async def next_codes(self, after: int) -> list[int]:
        self.asked_after.append(after)
        return [c for c in self.codes if c > after][: self.slice_size]


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


async def test_drains_everything_in_ascending_slices():
    queue = FakeQueue([1, 2, 3, 4, 5, 6, 7], slice_size=3)
    seen: list[list[int]] = []

    async def process(codes):
        seen.append(codes)
        return len(codes)

    result = await drain(queue.next_codes, process, budget_s=None)
    assert seen == [[1, 2, 3], [4, 5, 6], [7]]
    assert result == {"slices": 3, "schemes": 7, "fetched": 7, "failed": 0, "stopped": "done"}


async def test_a_failing_scheme_is_skipped_this_run_not_retried_in_a_loop():
    queue = FakeQueue([1, 2, 3, 4], slice_size=2)
    attempts: list[int] = []

    async def process(codes):
        attempts.extend(codes)
        return sum(1 for c in codes if c != 2)  # scheme 2 never fetches

    result = await drain(queue.next_codes, process, budget_s=None)
    assert attempts == [1, 2, 3, 4]              # each tried exactly once
    assert result["failed"] == 1 and result["fetched"] == 3 and result["stopped"] == "done"


async def test_stops_between_slices_when_the_time_budget_is_spent():
    queue = FakeQueue(list(range(1, 11)), slice_size=2)
    clock = Clock()

    async def process(codes):
        clock.now += 60  # each slice "takes" a minute
        return len(codes)

    result = await drain(queue.next_codes, process, budget_s=150, clock=clock)
    # slices start at t=0, 60, 120; at t=180 the 150 s budget is spent
    assert result["slices"] == 3 and result["stopped"] == "budget"
    assert result["schemes"] == 6


async def test_an_empty_queue_is_done_at_once():
    async def process(codes):
        raise AssertionError("nothing to process")

    result = await drain(FakeQueue([]).next_codes, process, budget_s=10)
    assert result == {"slices": 0, "schemes": 0, "fetched": 0, "failed": 0, "stopped": "done"}


async def test_the_cursor_is_the_highest_code_of_the_last_slice():
    queue = FakeQueue([10, 20, 30, 40], slice_size=2)

    async def process(codes):
        return len(codes)

    await drain(queue.next_codes, process, budget_s=None)
    assert queue.asked_after == [0, 20, 40]


@pytest.mark.parametrize("budget", [0, -5])
async def test_a_spent_budget_does_nothing(budget):
    async def process(codes):
        raise AssertionError("budget already spent")

    result = await drain(FakeQueue([1]).next_codes, process, budget_s=budget)
    assert result["stopped"] == "budget" and result["slices"] == 0
