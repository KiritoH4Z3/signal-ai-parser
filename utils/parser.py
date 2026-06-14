"""Gemini-backed intelligence extraction.

Public contract (do not break): ``extract_intelligence(text: str) -> dict``.

The flow is: read the key safely -> configure the model once -> call Gemini in
native JSON mode -> safely pull text out of the response (never blindly touch
``response.text``) -> parse with the defensive :func:`extract_json` helper ->
:func:`normalize_results` so the returned dict is always well-typed. Every
failure mode is re-raised as a typed :class:`SignalError` subclass so the UI can
map it to a friendly message.
"""

from __future__ import annotations

import os
import time
from typing import Any

from utils.constants import (
    APICallError,
    EmptyResponseError,
    GENERATION_CONFIG,
    MAX_INPUT_CHARS,
    MODEL_NAME,
    MalformedJSONError,
    MissingKeyError,
    SignalError,
    extract_json,
    normalize_results,
)

_PROMPT = """You are a business intelligence extraction engine.
Analyze the text after the marker and return a single JSON object with EXACTLY
this shape (no markdown, no commentary):

{
  "summary": "Two-sentence executive summary of the key information.",
  "entities": {
    "companies": ["..."],
    "people": ["..."],
    "places": ["..."]
  },
  "metrics": [
    {"label": "Revenue", "value": "$4.2B", "change": "+27%"}
  ],
  "sentiment": {
    "label": "Positive",
    "confidence": "High",
    "confidence_score": 88,
    "reasoning": "One-sentence explanation."
  },
  "topics": ["..."]
}

Rules:
- summary: exactly two sentences.
- entities: lists may be empty; do not invent names.
- metrics: each item is an object with "label", "value" and optional "change"
  (e.g. "+12%"); pull the real numbers from the text. Empty list if none.
- sentiment.label: exactly one of Positive, Neutral, Negative.
- sentiment.confidence: exactly one of High, Medium, Low.
- sentiment.confidence_score: integer 0-100 reflecting how sure you are.
- topics: up to 5 short tags.

TEXT TO ANALYZE:
"""


def has_api_key() -> bool:
    """Return whether a non-empty GOOGLE_API_KEY is available.

    Checks Streamlit secrets first (the deployed path) and falls back to the
    ``GOOGLE_API_KEY`` environment variable. Never raises — a missing
    ``secrets.toml`` is treated as "no key".

    Returns:
        ``True`` if a usable key is configured, otherwise ``False``.
    """
    return bool(_read_api_key())


def _read_api_key() -> str:
    """Read the API key from st.secrets or the environment, tolerantly."""
    try:
        import streamlit as st

        try:
            key = st.secrets["GOOGLE_API_KEY"]
            if key and str(key).strip():
                return str(key).strip()
        except (KeyError, FileNotFoundError):
            pass
        except Exception:
            # st.secrets can raise StreamlitSecretNotFoundError when no file
            # exists; treat any access problem as "no key".
            pass
    except Exception:
        # streamlit not importable in some contexts — fall through to env.
        pass

    env_key = os.environ.get("GOOGLE_API_KEY", "")
    return env_key.strip()


def _get_model() -> Any:
    """Configure the SDK once and return a cached GenerativeModel.

    Uses ``st.cache_resource`` when available so repeated extractions do not
    re-initialize the SDK on every click. Falls back to a plain build if the
    cache decorator is unavailable.

    Raises:
        MissingKeyError: If no API key is configured.
        APICallError: If the SDK cannot be imported / configured.
    """
    key = _read_api_key()
    if not key:
        raise MissingKeyError("No GOOGLE_API_KEY is configured.")

    try:
        import streamlit as st

        @st.cache_resource(show_spinner=False)
        def _build(_key: str) -> Any:
            return _build_model(_key)

        return _build(key)
    except MissingKeyError:
        raise
    except Exception:
        # No streamlit cache available — build directly.
        return _build_model(key)


def _build_model(key: str) -> Any:
    """Configure genai with the key and return the model (no caching)."""
    try:
        import google.generativeai as genai
    except ImportError as exc:  # pragma: no cover - depends on env
        raise APICallError(
            "The google-generativeai package is not installed."
        ) from exc

    try:
        genai.configure(api_key=key)
        return genai.GenerativeModel(MODEL_NAME)
    except Exception as exc:  # pragma: no cover - SDK init failure
        raise APICallError(f"Could not initialize the AI client: {exc}") from exc


def _extract_text(response: Any) -> str:
    """Safely pull text from a Gemini response without tripping ValueError.

    Accessing ``response.text`` raises when a candidate has no text parts (e.g.
    a SAFETY / RECITATION block, or MAX_TOKENS with no content). We instead walk
    ``response.candidates[].content.parts`` and concatenate text parts, skipping
    non-text parts.

    Args:
        response: The object returned by ``model.generate_content``.

    Returns:
        The concatenated text from the first usable candidate.

    Raises:
        EmptyResponseError: If no text could be recovered.
    """
    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        finish = getattr(candidate, "finish_reason", None)
        finish_name = getattr(finish, "name", str(finish)) if finish else ""
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        collected = [
            part.text
            for part in parts
            if getattr(part, "text", None)
        ]
        if collected:
            return "".join(collected).strip()
        if finish_name in {"SAFETY", "RECITATION"}:
            raise EmptyResponseError(
                "The model declined to analyze this text — it may have been "
                "flagged. Try different wording or another snippet."
            )

    # Last resort: try the convenience accessor, guarding its ValueError.
    try:
        text = (response.text or "").strip()
        if text:
            return text
    except Exception:
        pass

    raise EmptyResponseError(
        "The model returned an empty response. Please try again."
    )


# Transient google.api_core errors we retry exactly once.
_TRANSIENT_NAMES = {
    "ServiceUnavailable",
    "DeadlineExceeded",
    "ResourceExhausted",
    "InternalServerError",
}


def _is_transient(exc: Exception) -> bool:
    """Whether an exception looks like a transient, retry-worthy API failure.

    Matches on the exception class name (covers the common
    ``google.api_core.exceptions.*`` failures) and, as a fallback robust to SDK
    class renames, on a numeric status ``code`` of 429/500/503/504 if present.
    """
    if type(exc).__name__ in _TRANSIENT_NAMES:
        return True
    code = getattr(exc, "code", None)
    return code in {429, 500, 503, 504}


def extract_intelligence(text: str) -> dict:
    """Extract structured business intelligence from raw text via Gemini.

    Calls Gemini in JSON mode, recovers the JSON defensively, normalizes it to a
    guaranteed shape, and returns it. Over-long input is truncated to
    :data:`MAX_INPUT_CHARS`. Retries once on a transient API failure.

    Args:
        text: The raw text to analyze.

    Returns:
        A normalized results dict with keys ``summary``, ``entities``,
        ``metrics``, ``sentiment`` and ``topics``.

    Raises:
        SignalError: One of the typed subclasses (MissingKeyError,
            APICallError, EmptyResponseError, MalformedJSONError) on failure.
    """
    if not text or not text.strip():
        raise SignalError("Please provide some text to analyze.")

    snippet = text.strip()[:MAX_INPUT_CHARS]
    model = _get_model()
    prompt = f"{_PROMPT}{snippet}"

    last_exc: Exception | None = None
    for attempt in range(2):  # initial try + one retry
        try:
            response = model.generate_content(
                prompt, generation_config=GENERATION_CONFIG
            )
            raw = _extract_text(response)
            parsed = extract_json(raw)  # raises MalformedJSONError on failure
            return normalize_results(parsed)
        except MalformedJSONError as exc:
            last_exc = exc
            if attempt == 0:
                time.sleep(0.8)
                continue
            raise
        except EmptyResponseError:
            raise
        except SignalError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt == 0 and _is_transient(exc):
                time.sleep(0.8)
                continue
            raise APICallError(
                f"The AI request failed: {exc}. This is often transient — "
                "please try again."
            ) from exc

    # Unreachable in practice, but keep the type-checker / runtime happy.
    raise APICallError(str(last_exc) if last_exc else "Unknown error.")
