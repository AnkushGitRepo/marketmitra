"""Test isolation: the suite must not depend on secrets in a developer's local
`.env` (e.g. an `IPO_INGEST_TOKEN` set to run the app locally). Tests that need
a token set one explicitly with monkeypatch.

Deliberately a plain save/restore rather than `monkeypatch`: using monkeypatch
here would change pytest's teardown order and undo other tests' patches too late.
"""

import pytest

from app.config import get_settings

_SECRETS = ("ipo_ingest_token", "screener_ingest_token")


@pytest.fixture(autouse=True)
def _no_ambient_secrets():
    settings = get_settings()
    saved = {name: getattr(settings, name) for name in _SECRETS if hasattr(settings, name)}
    for name in saved:
        setattr(settings, name, "")
    yield
    for name, value in saved.items():
        setattr(settings, name, value)
