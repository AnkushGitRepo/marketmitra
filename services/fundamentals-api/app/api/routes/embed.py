"""POST /embed — sentence embeddings for the main app's Phase 10 retrieval
(ADR 0020). Server-to-server only, guarded by the shared `ipo_ingest_token`
(the same trusted-caller secret the other ingest routes use)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.ingestion.embeddings import EMBED_DIM, EmbeddingError, embed_texts
from app.security import require_bearer

router = APIRouter(tags=["embeddings"])
_settings = get_settings()

# One indexer batch; the Next side already chunks to 32.
MAX_TEXTS = 64
MAX_CHARS = 8000


class EmbedIn(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)


class EmbedOut(BaseModel):
    vectors: list[list[float]]
    dim: int
    model: str


@router.post("/embed", response_model=EmbedOut)
async def embed(body: EmbedIn, authorization: str | None = Header(default=None)) -> EmbedOut:
    require_bearer(authorization, _settings.ipo_ingest_token, name="ipo_ingest_token")

    texts = [t[:MAX_CHARS] for t in body.texts]
    try:
        vectors = embed_texts(texts)
    except EmbeddingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return EmbedOut(vectors=vectors, dim=EMBED_DIM, model=_settings.embed_model)
