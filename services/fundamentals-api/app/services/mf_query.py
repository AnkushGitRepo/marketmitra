"""Mutual fund read path (ADR 0067): screener list, fund detail, NAV history,
facets and category peers. Pure Postgres reads — nothing is fetched live.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MfFactsheetORM, MfMetricsORM, MfNavORM, MfSchemeORM
from app.services.mf_peer_group import is_thematic_sub_category, peer_group

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
NAV_RANGES_DAYS: dict[str, int | None] = {
    "1m": 30, "6m": 183, "1y": 365, "3y": 1096, "5y": 1826, "10y": 3653, "max": None,
}

_METRIC_COLS = (
    "ret_1m", "ret_3m", "ret_6m", "ret_1y", "ret_3y", "ret_5y", "ret_10y",
    "std_dev_3y", "sharpe_3y", "sortino_3y", "max_drawdown_3y", "sip_xirr_3y", "sip_xirr_5y",
)
_FACT_COLS = ("expense_ratio", "aum_cr", "exit_load", "fund_manager", "benchmark", "launch_date")

# Whitelist: the API's `sort` value maps to a column, never into raw SQL.
SORT_COLUMNS = {
    **{c: getattr(MfMetricsORM, c) for c in _METRIC_COLS},
    "expense_ratio": MfFactsheetORM.expense_ratio,
    "aum_cr": MfFactsheetORM.aum_cr,
    "name": MfSchemeORM.name,
    "nav": MfSchemeORM.latest_nav,
}


@dataclass(frozen=True)
class FundFilters:
    q: str | None = None
    category: str | None = None
    sub_category: str | None = None
    fund_house: str | None = None
    plan: str | None = "direct"
    option: str | None = "growth"
    min_ret_1y: float | None = None
    min_ret_3y: float | None = None
    min_ret_5y: float | None = None
    max_expense_ratio: float | None = None
    min_aum_cr: float | None = None
    max_std_dev_3y: float | None = None
    min_sharpe_3y: float | None = None
    sort: str = "ret_3y"
    order: str = "desc"
    limit: int = DEFAULT_LIMIT
    offset: int = 0


def _f(value: object) -> float | None:
    return float(value) if value is not None else None


def _base_query() -> Select:
    return (
        select(MfSchemeORM, MfMetricsORM, MfFactsheetORM)
        .outerjoin(MfMetricsORM, MfMetricsORM.scheme_code == MfSchemeORM.scheme_code)
        .outerjoin(MfFactsheetORM, MfFactsheetORM.scheme_code == MfSchemeORM.scheme_code)
        .where(MfSchemeORM.is_active.is_(True))
    )


def _apply_filters(stmt: Select, f: FundFilters) -> Select:
    exact = {
        MfSchemeORM.category: f.category, MfSchemeORM.sub_category: f.sub_category,
        MfSchemeORM.fund_house: f.fund_house, MfSchemeORM.plan: f.plan, MfSchemeORM.option: f.option,
    }
    for col, value in exact.items():
        if value:
            stmt = stmt.where(col == value)
    if f.q:
        escaped = f.q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(MfSchemeORM.name.ilike(f"%{escaped}%", escape="\\"))
    minimums = {
        MfMetricsORM.ret_1y: f.min_ret_1y, MfMetricsORM.ret_3y: f.min_ret_3y,
        MfMetricsORM.ret_5y: f.min_ret_5y, MfMetricsORM.sharpe_3y: f.min_sharpe_3y,
        MfFactsheetORM.aum_cr: f.min_aum_cr,
    }
    for col, value in minimums.items():
        if value is not None:
            stmt = stmt.where(col >= value)
    maximums = {MfFactsheetORM.expense_ratio: f.max_expense_ratio, MfMetricsORM.std_dev_3y: f.max_std_dev_3y}
    for col, value in maximums.items():
        if value is not None:
            stmt = stmt.where(col <= value)
    return stmt


def _summary(scheme: MfSchemeORM, metrics: MfMetricsORM | None, fact: MfFactsheetORM | None) -> dict:
    return {
        "scheme_code": scheme.scheme_code,
        "name": scheme.name,
        "base_name": scheme.base_name,
        "fund_house": scheme.fund_house,
        "category": scheme.category,
        "sub_category": scheme.sub_category,
        "plan": scheme.plan,
        "option": scheme.option,
        "nav": _f(scheme.latest_nav),
        "nav_date": scheme.latest_nav_date,
        **{c: _f(getattr(metrics, c, None)) for c in _METRIC_COLS},
        "expense_ratio": _f(getattr(fact, "expense_ratio", None)),
        "aum_cr": _f(getattr(fact, "aum_cr", None)),
    }


async def list_funds(session: AsyncSession, f: FundFilters, *, with_total: bool = True) -> dict:
    stmt = _apply_filters(_base_query(), f)
    total = (
        await session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
        if with_total
        else None
    )
    sort_col = SORT_COLUMNS.get(f.sort, MfMetricsORM.ret_3y)
    direction = asc if f.order == "asc" else desc
    ordering = direction(sort_col).nulls_last() if f.sort != "name" else direction(sort_col)
    limit = max(1, min(f.limit, MAX_LIMIT))
    rows = (
        await session.execute(
            stmt.order_by(ordering, MfSchemeORM.scheme_code).limit(limit).offset(max(0, f.offset))
        )
    ).all()
    return {
        "total": int(total or 0),
        "limit": limit,
        "offset": max(0, f.offset),
        "items": [_summary(s, m, fa) for s, m, fa in rows],
    }


async def get_fund(session: AsyncSession, scheme_code: int) -> dict | None:
    row = (
        await session.execute(_base_query().where(MfSchemeORM.scheme_code == scheme_code))
    ).first()
    if row is None:
        # Dormant schemes stay viewable by direct link.
        row = (
            await session.execute(
                select(MfSchemeORM, MfMetricsORM, MfFactsheetORM)
                .outerjoin(MfMetricsORM, MfMetricsORM.scheme_code == MfSchemeORM.scheme_code)
                .outerjoin(MfFactsheetORM, MfFactsheetORM.scheme_code == MfSchemeORM.scheme_code)
                .where(MfSchemeORM.scheme_code == scheme_code)
            )
        ).first()
    if row is None:
        return None
    scheme, metrics, fact = row
    detail = _summary(scheme, metrics, fact)
    detail.update(
        {
            "scheme_type": scheme.scheme_type,
            "isin_growth": scheme.isin_growth,
            "isin_reinvest": scheme.isin_reinvest,
            "is_active": scheme.is_active,
            "peer_group": peer_group(scheme.name, scheme.sub_category),
            "metrics_as_of": getattr(metrics, "as_of", None),
            "factsheet": None
            if fact is None
            else {
                **{c: (_f(getattr(fact, c)) if c in ("expense_ratio", "aum_cr") else getattr(fact, c))
                   for c in _FACT_COLS},
                "as_of": fact.as_of,
                "source": fact.source,
            },
        }
    )
    return detail


async def get_nav_history(session: AsyncSession, scheme_code: int, range_key: str) -> list[dict]:
    days = NAV_RANGES_DAYS.get(range_key, 365)
    stmt = select(MfNavORM.nav_date, MfNavORM.nav).where(MfNavORM.scheme_code == scheme_code)
    if days is not None:
        latest = await session.scalar(
            select(func.max(MfNavORM.nav_date)).where(MfNavORM.scheme_code == scheme_code)
        )
        if latest is None:
            return []
        stmt = stmt.where(MfNavORM.nav_date >= latest - timedelta(days=days))
    rows = (await session.execute(stmt.order_by(MfNavORM.nav_date))).all()
    return [{"date": d, "nav": float(n)} for d, n in rows]


async def _same_family_sub_categories(session: AsyncSession, me: MfSchemeORM) -> list[str]:
    """Sub-categories that are compared together with `me`'s: just its own, except the sector and
    theme ones, which SEBI spreads over several names for the same kind of fund."""
    own = me.sub_category or ""
    if not is_thematic_sub_category(own):
        return [own]
    rows = await session.scalars(
        select(MfSchemeORM.sub_category)
        .where(MfSchemeORM.category == me.category, MfSchemeORM.sub_category.is_not(None))
        .distinct()
    )
    return sorted({sub for sub in rows if is_thematic_sub_category(sub)} | {own})


async def get_peers(session: AsyncSession, scheme_code: int, limit: int = 8) -> list[dict]:
    me = await session.get(MfSchemeORM, scheme_code)
    if me is None or me.sub_category is None:
        return []
    group = peer_group(me.name, me.sub_category)
    # The group can be narrower than the sub-category (SEBI's sector and theme sub-categories mix a
    # Taiwan feeder with a defence fund), so fetch the whole family and narrow it here.
    candidates: list[dict] = []
    for sub_category in await _same_family_sub_categories(session, me):
        f = FundFilters(
            category=me.category, sub_category=sub_category, plan=me.plan, option=me.option,
            sort="ret_3y", limit=MAX_LIMIT,
        )
        candidates += (await list_funds(session, f, with_total=False))["items"]
    same_group = [
        i for i in candidates
        if i["scheme_code"] != scheme_code and peer_group(i["name"], i["sub_category"]) == group
    ]
    # Best 3-year return first across the pooled sub-categories; a fund with no figure goes last.
    same_group.sort(key=lambda i: (i["ret_3y"] is None, -(i["ret_3y"] or 0.0)))
    return same_group[:limit]


async def get_facets(session: AsyncSession) -> dict:
    async def distinct(col) -> list[str]:
        rows = await session.scalars(
            select(col).where(MfSchemeORM.is_active.is_(True), col.is_not(None)).distinct().order_by(col)
        )
        return list(rows)

    pairs = (
        await session.execute(
            select(MfSchemeORM.category, MfSchemeORM.sub_category)
            .where(MfSchemeORM.is_active.is_(True), MfSchemeORM.sub_category.is_not(None))
            .distinct()
            .order_by(MfSchemeORM.category, MfSchemeORM.sub_category)
        )
    ).all()
    sub_categories: dict[str, list[str]] = {}
    for category, sub in pairs:
        sub_categories.setdefault(category, []).append(sub)
    newest: date | None = await session.scalar(select(func.max(MfSchemeORM.latest_nav_date)))
    return {
        "categories": await distinct(MfSchemeORM.category),
        "sub_categories": sub_categories,
        "fund_houses": await distinct(MfSchemeORM.fund_house),
        "nav_as_of": newest,
    }
