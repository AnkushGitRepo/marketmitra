import logging
import re
from collections.abc import AsyncIterator

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CompanyMasterORM, CompanyORM
from app.db.session import get_session
from app.security import log_safe
from app.services.fundamentals_service import get_or_create_company
from app.services.search_service import ensure_company_master_populated

DbSession = AsyncIterator[AsyncSession]

logger = logging.getLogger(__name__)

# An NSE symbol: letters, digits and the few punctuation marks real tickers use (M&M, BAJAJ-AUTO, NAM-INDIA), at most 30 characters.
# A symbol is untrusted input: anything else is rejected before it reaches the database or a log line, so a NUL byte, a 5,000-character
# string or a SQL fragment never gets to the driver (and never comes back in an error message).
_SYMBOL_RE = re.compile(r"^[A-Za-z0-9&._-]{1,30}$")


async def get_db() -> DbSession:
    async for session in get_session():
        yield session


async def _symbol_is_known(session: AsyncSession, symbol: str) -> bool:
    """True for a company we already hold, or one in the official NSE listing (company_master, refreshed daily by the screener job).

    Anything else is not a real symbol: creating a row for it would let any anonymous caller fill the database with junk and trigger an
    upstream NSE/BSE/yfinance lookup per made-up symbol (a cheap way to burn upstream quota and CPU). `symbol` is already upper-cased and validated.
    """
    if (await session.execute(select(CompanyORM.nse_symbol).where(CompanyORM.nse_symbol == symbol))).first():
        return True
    await ensure_company_master_populated(session)
    return (await session.execute(select(CompanyMasterORM.symbol).where(CompanyMasterORM.symbol == symbol))).first() is not None


async def resolve_company(symbol: str, session: AsyncSession) -> CompanyORM:
    """`symbol` is treated as an NSE symbol (the common case). BSE-code-only
    companies aren't reachable through this path yet — a real, tracked gap;
    see ROADMAP.md Phase 4."""
    if not _SYMBOL_RE.fullmatch(symbol):
        raise HTTPException(status_code=422, detail="invalid symbol")
    symbol = symbol.upper()
    try:
        known = await _symbol_is_known(session, symbol)
    except Exception as exc:
        logger.exception("could not check symbol %s", log_safe(symbol))
        raise HTTPException(status_code=502, detail="could not resolve company") from exc
    if not known:
        raise HTTPException(status_code=404, detail="unknown symbol")
    try:
        return await get_or_create_company(session, nse_symbol=symbol)
    except Exception as exc:
        # The cause (SQL, driver, connection string) stays in the server log; the client only learns that it failed.
        logger.exception("could not resolve company %s", log_safe(symbol))
        raise HTTPException(status_code=502, detail="could not resolve company") from exc
