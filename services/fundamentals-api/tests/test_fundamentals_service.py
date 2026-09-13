"""get_or_create_company's concurrency behaviour — a brand-new company's page
fires ~10 requests at once (company, ratios, shareholding, peers, documents,
financials x3, prices x4), all of which race to create the same row the
first time it's ever requested. Only one INSERT can win the unique
nse_symbol constraint; every other caller must recover, not 502.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.models import CompanyORM
from app.services import fundamentals_service as svc


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None

    def scalars(self):
        return iter(self._rows)


class _FakeSession:
    """`select_responses` is popped from the front on each execute() call —
    first the pre-insert "does it exist" check, then (on conflict) the
    re-select after rollback."""

    def __init__(self, select_responses, *, commit_raises=None):
        self._select_responses = list(select_responses)
        self._commit_raises = commit_raises
        self.rolled_back = False
        self.added = None

    async def execute(self, _stmt):
        return _FakeScalars(self._select_responses.pop(0))

    def add(self, obj):
        self.added = obj

    async def commit(self):
        if self._commit_raises is not None:
            exc, self._commit_raises = self._commit_raises, None
            raise exc

    async def rollback(self):
        self.rolled_back = True

    async def refresh(self, _obj):
        pass


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    async def empty_quote(*_a, **_k):
        return {}

    monkeypatch.setattr(svc.tier1_nse_bse, "get_nse_quote", empty_quote)
    monkeypatch.setattr(svc.tier1_nse_bse, "get_bse_quote", empty_quote)
    monkeypatch.setattr(svc.tier2_yfinance, "get_quote_gap_fill", empty_quote)


@pytest.mark.asyncio
async def test_create_company_recovers_when_it_loses_the_insert_race():
    winner = CompanyORM(id=1, nse_symbol="AXISBANK", name="Axis Bank Limited")
    session = _FakeSession(
        select_responses=[[], [winner]],  # not found, then found after rollback
        commit_raises=IntegrityError("insert", {}, Exception("duplicate key")),
    )

    result = await svc.get_or_create_company(session, nse_symbol="AXISBANK")

    assert result is winner
    assert session.rolled_back is True


@pytest.mark.asyncio
async def test_create_company_succeeds_normally_when_no_race():
    session = _FakeSession(select_responses=[[]])  # not found; insert succeeds

    result = await svc.get_or_create_company(session, nse_symbol="NEWCO")

    assert result.nse_symbol == "NEWCO"
    assert session.rolled_back is False


@pytest.mark.asyncio
async def test_create_company_reraises_a_genuinely_different_conflict():
    """If the re-select after rollback finds nothing, this wasn't the
    expected "someone else just created it" race — surface the error rather
    than silently returning something wrong."""
    session = _FakeSession(
        select_responses=[[], []],  # not found, then still not found
        commit_raises=IntegrityError("insert", {}, Exception("some other constraint")),
    )

    with pytest.raises(IntegrityError):
        await svc.get_or_create_company(session, nse_symbol="AXISBANK")
