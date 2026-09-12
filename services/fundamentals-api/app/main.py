import logging

from fastapi import FastAPI, Request
from fastapi.responses import ORJSONResponse

from app.api.routes import (
    companies,
    documents,
    embed,
    financials,
    indices,
    ipos,
    news,
    pdf_text,
    prices,
    quote,
    screener,
    search,
)
from app.config import get_settings
from app.rate_limit import check_rate_limit, client_ip

logging.basicConfig(level=get_settings().log_level)

app = FastAPI(
    title="MarketMitra Fundamentals API",
    description=(
        "screener.in-style ratios, financial statements, shareholding, and "
        "price history for Indian-listed companies — sourced from a "
        "three-tier free-data fallback chain (see ADR 0011). No paid tier, "
        "no vendor keys required."
    ),
    default_response_class=ORJSONResponse,
)

app.include_router(companies.router)
app.include_router(financials.router)
app.include_router(prices.router)
app.include_router(documents.router)
app.include_router(indices.router)
app.include_router(news.router)
app.include_router(pdf_text.router)
app.include_router(embed.router)
app.include_router(ipos.router)
app.include_router(quote.router)
app.include_router(search.router)
app.include_router(screener.router)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Fair-use limit per client IP (ADR 0019). No-op when Upstash env vars
    are unset. `/health` is exempt so uptime checks never trip it."""
    if request.url.path == "/health":
        return await call_next(request)

    ip = client_ip(request.headers, request.client.host if request.client else None)
    result = await check_rate_limit(ip, get_settings())
    if not result.allowed:
        return ORJSONResponse(
            {"detail": "Rate limit exceeded. Slow down and try again shortly."},
            status_code=429,
            headers={
                "Retry-After": str(result.retry_after),
                "RateLimit-Limit": str(result.limit),
                "RateLimit-Remaining": "0",
                "RateLimit-Reset": str(result.retry_after),
            },
        )

    response = await call_next(request)
    if result.limit:
        response.headers["RateLimit-Limit"] = str(result.limit)
        response.headers["RateLimit-Remaining"] = str(result.remaining)
        response.headers["RateLimit-Reset"] = str(result.retry_after)
    return response


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
