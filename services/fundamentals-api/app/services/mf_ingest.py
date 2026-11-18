"""Mutual fund write path (ADR 0067): upsert schemes, NAV points, metrics and
factsheet rows. Called by the token-guarded POST /funds/ingest/* routes, which
the out-of-band refresh job (scripts/refresh_funds.py) drives.
"""

from __future__ import annotations

import asyncio
import logging
import math
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MfFactsheetORM, MfMetricsORM, MfNavORM, MfSchemeORM
from app.services.mf_metrics import compute_metrics

logger = logging.getLogger("fundamentals.mf_ingest")

CHUNK = 1000
MAX_NAV = 1e10  # Numeric(18,6) headroom; larger is a data error
ACTIVE_WINDOW_DAYS = 10  # a scheme whose last NAV is older than this vs the newest NAV is dormant

_SCHEME_FIELDS = (
    "name", "base_name", "fund_house", "scheme_type", "category", "sub_category",
    "plan", "option", "isin_growth", "isin_reinvest", "latest_nav", "latest_nav_date",
)
_FACTSHEET_FIELDS = (
    "expense_ratio", "aum_cr", "exit_load", "fund_manager", "benchmark", "launch_date", "as_of",
)


def _chunks(items: list, size: int = CHUNK) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def _to_date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def scheme_values(row: dict, *, newest: date | None) -> dict | None:
    """Validated insert values for one scheme row, or None if unusable."""
    try:
        code = int(row["scheme_code"])
    except (KeyError, TypeError, ValueError):
        return None
    if not row.get("name") or not row.get("fund_house"):
        return None
    nav_date = _to_date(row.get("latest_nav_date"))
    values = {"scheme_code": code, **{f: row.get(f) for f in _SCHEME_FIELDS}}
    values["latest_nav_date"] = nav_date
    # "N.A." NAVs (no usable price) never count as active, whatever the date says.
    values["is_active"] = bool(
        nav_date
        and values.get("latest_nav")
        and newest
        and nav_date >= newest - timedelta(days=ACTIVE_WINDOW_DAYS)
    )
    return values


async def ingest_schemes(
    session: AsyncSession, rows: list[dict], *, as_of: date | None = None
) -> dict:
    """Upsert the scheme master and record each scheme's latest NAV point.

    `as_of` is the newest NAV date of the whole AMFI file. The refresh job posts
    the file in batches, so a batch must not judge "recent" by its own dates.
    """
    dates = [d for d in (_to_date(r.get("latest_nav_date")) for r in rows) if d]
    newest = as_of or (max(dates) if dates else None)
    # One row per code: ON CONFLICT cannot touch the same row twice in a statement.
    by_code = {v["scheme_code"]: v for v in (scheme_values(r, newest=newest) for r in rows) if v}
    values = list(by_code.values())

    for chunk in _chunks(values):
        stmt = insert(MfSchemeORM).values(chunk)
        update_cols = {c: stmt.excluded[c] for c in (*_SCHEME_FIELDS, "is_active")}
        update_cols["updated_at"] = func.now()
        await session.execute(
            stmt.on_conflict_do_update(index_elements=["scheme_code"], set_=update_cols)
        )
    deactivated = 0
    if newest is not None:
        # A scheme that left AMFI's file keeps its old date; it goes dormant once that
        # date is stale against the file, whether or not this batch mentioned it.
        stale = await session.execute(
            update(MfSchemeORM)
            .where(
                MfSchemeORM.is_active.is_(True),
                (MfSchemeORM.latest_nav_date.is_(None))
                | (MfSchemeORM.latest_nav_date < newest - timedelta(days=ACTIVE_WINDOW_DAYS)),
            )
            .values(is_active=False)
        )
        deactivated = stale.rowcount or 0

    nav_points = [
        {"scheme_code": v["scheme_code"], "nav_date": v["latest_nav_date"], "nav": v["latest_nav"]}
        for v in values
        if v["latest_nav_date"] and v["latest_nav"]
    ]
    for chunk in _chunks(nav_points):
        stmt = insert(MfNavORM).values(chunk)
        # AMFI is authoritative for the latest day and occasionally restates it.
        await session.execute(
            stmt.on_conflict_do_update(
                index_elements=["scheme_code", "nav_date"], set_={"nav": stmt.excluded.nav}
            )
        )
    await session.commit()
    return {
        "schemes": len(values),
        "skipped": len(rows) - len(values),
        "nav_points": len(nav_points),
        "deactivated": deactivated,
    }


async def ingest_nav(session: AsyncSession, scheme_code: int, points: list[list]) -> dict:
    """Insert NAV history points `[iso_date, nav]` for one scheme (idempotent)."""
    known = await session.scalar(
        select(MfSchemeORM.scheme_code).where(MfSchemeORM.scheme_code == scheme_code)
    )
    if known is None:
        return {"scheme_code": scheme_code, "inserted": 0, "error": "unknown scheme"}
    values = []
    for point in points:
        nav_date = _to_date(point[0]) if len(point) == 2 else None
        try:
            nav = float(point[1])
        except (TypeError, ValueError, IndexError):
            continue
        if nav_date and 0 < nav < MAX_NAV and math.isfinite(nav):
            values.append({"scheme_code": scheme_code, "nav_date": nav_date, "nav": nav})
    for chunk in _chunks(values, 2000):
        await session.execute(insert(MfNavORM).values(chunk).on_conflict_do_nothing())
    # Stamp even when the source had nothing, so the scheme leaves the backfill queue.
    await session.execute(
        update(MfSchemeORM)
        .where(MfSchemeORM.scheme_code == scheme_code)
        .values(history_checked_at=datetime.now(tz=UTC))
    )
    await session.commit()
    return {"scheme_code": scheme_code, "inserted": len(values)}


async def recompute_metrics(session: AsyncSession, scheme_codes: list[int]) -> dict:
    """Recompute and store metrics from the NAV rows held for each scheme."""
    done = 0
    for code in scheme_codes:
        rows = (
            await session.execute(
                select(MfNavORM.nav_date, MfNavORM.nav)
                .where(MfNavORM.scheme_code == code)
                .order_by(MfNavORM.nav_date)
            )
        ).all()
        series = [(d, float(n)) for d, n in rows]
        if len(series) < 2:
            continue
        metrics = await asyncio.to_thread(compute_metrics, series)
        values = {"scheme_code": code, "as_of": series[-1][0], **metrics}
        stmt = insert(MfMetricsORM).values(**values)
        update_cols = {k: v for k, v in values.items() if k != "scheme_code"}
        update_cols["computed_at"] = datetime.now(tz=UTC)
        try:
            # A savepoint, so one bad scheme cannot roll back the rest of the batch.
            async with session.begin_nested():
                await session.execute(
                    stmt.on_conflict_do_update(index_elements=["scheme_code"], set_=update_cols)
                )
            done += 1
        except Exception:
            logger.exception("metrics upsert failed for scheme %s", code)
    await session.commit()
    return {"computed": done, "requested": len(scheme_codes)}


async def ingest_factsheet(session: AsyncSession, rows: list[dict]) -> dict:
    """Upsert disclosed facts. Only provided fields overwrite stored ones."""
    codes = {
        c
        for c in (
            await session.scalars(select(MfSchemeORM.scheme_code).where(
                MfSchemeORM.scheme_code.in_([int(r["scheme_code"]) for r in rows if str(r.get("scheme_code", "")).isdigit()])
            ))
        )
    }
    written = 0
    for row in rows:
        if not str(row.get("scheme_code", "")).isdigit() or int(row["scheme_code"]) not in codes:
            continue
        values = {"scheme_code": int(row["scheme_code"]), "source": str(row.get("source") or "unknown")[:64]}
        for field in _FACTSHEET_FIELDS:
            if row.get(field) is not None:
                values[field] = _to_date(row[field]) if field in ("launch_date", "as_of") else row[field]
        stmt = insert(MfFactsheetORM).values(**values)
        update_cols = {k: v for k, v in values.items() if k != "scheme_code"}
        update_cols["updated_at"] = func.now()
        await session.execute(
            stmt.on_conflict_do_update(index_elements=["scheme_code"], set_=update_cols)
        )
        written += 1
    await session.commit()
    return {"written": written, "skipped": len(rows) - written}


async def backfill_queue(session: AsyncSession, limit: int) -> list[int]:
    """Active Direct-Growth schemes whose NAV history has not been fetched yet."""
    stmt = (
        select(MfSchemeORM.scheme_code)
        .where(
            MfSchemeORM.is_active.is_(True),
            MfSchemeORM.plan == "direct",
            MfSchemeORM.option == "growth",
            MfSchemeORM.history_checked_at.is_(None),
        )
        .order_by(MfSchemeORM.scheme_code)
        .limit(limit)
    )
    return list(await session.scalars(stmt))


async def metrics_queue(session: AsyncSession, after: int, limit: int) -> list[int]:
    """Next page of active Direct-Growth scheme codes (keyset by code) to recompute."""
    stmt = (
        select(MfSchemeORM.scheme_code)
        .where(
            MfSchemeORM.is_active.is_(True),
            MfSchemeORM.plan == "direct",
            MfSchemeORM.option == "growth",
            MfSchemeORM.scheme_code > after,
        )
        .order_by(MfSchemeORM.scheme_code)
        .limit(limit)
    )
    return list(await session.scalars(stmt))
