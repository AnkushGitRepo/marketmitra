# The fundamentals data service on Google Cloud Run (ADR 0060, issue #169).
# Same code and the same trimmed requirements.txt as the Vercel deployment; only the host differs.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FASTEMBED_CACHE_DIR=/opt/embed-cache

WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake the embedding model into the image so the first /embed call does not download ~64 MB (about 18 s on a cold start).
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5', cache_dir='/opt/embed-cache')"

COPY app ./app

RUN useradd --system --uid 10001 appuser && chown -R appuser /opt/embed-cache
USER appuser

# Cloud Run sets PORT (8080). One worker: Cloud Run scales by adding instances.
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
