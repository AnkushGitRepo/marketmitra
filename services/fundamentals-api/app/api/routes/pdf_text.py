"""POST /documents/extract-text — plain-text extraction from a PDF URL.

Called server-to-server by the main app's Phase 10 corpus indexer
(ADR 0020) to turn annual-report / DRHP PDFs into text for chunking and
embedding. Guarded by the same ``ipo_ingest_token`` shared secret the
other trusted-caller ingest route uses — refused (503) if that isn't
configured, (401) on a bad token.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.ingestion.pdf_text import PdfTextError, fetch_pdf_text
from app.security import require_bearer

router = APIRouter(prefix="/documents", tags=["documents"])
_settings = get_settings()


class ExtractTextIn(BaseModel):
    url: str
    # DRHPs can be 400+ pages; let the caller cap the work.
    max_pages: int | None = Field(default=None, ge=1, le=2000)


class PageText(BaseModel):
    page: int
    text: str


class ExtractTextOut(BaseModel):
    url: str
    bytes: int
    page_count: int
    pages: list[PageText]
    text: str


@router.post("/extract-text", response_model=ExtractTextOut)
async def extract_text(
    body: ExtractTextIn,
    authorization: str | None = Header(default=None),
) -> ExtractTextOut:
    require_bearer(authorization, _settings.ipo_ingest_token, name="ipo_ingest_token")

    if not body.url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="url must be http(s)")

    try:
        result = await fetch_pdf_text(body.url, max_pages=body.max_pages)
    except PdfTextError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ExtractTextOut(**result)
