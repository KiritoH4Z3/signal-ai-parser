"""Constants, configuration, typed errors and PURE helper functions for Signal.

This module is intentionally free of any ``streamlit`` or ``google.generativeai``
imports. Everything here is plain Python + stdlib so that the unit tests in
``tests/test_parser.py`` can import and exercise the parsing/normalization logic
offline, with no API key and no network. Keep it that way: side-effect-free.
"""

from __future__ import annotations

import html
import json
import re
from datetime import datetime
from typing import Any

# --------------------------------------------------------------------------- #
# App / model configuration
# --------------------------------------------------------------------------- #

APP_NAME: str = "Signal"
APP_TAGLINE: str = "Convert unstructured text into structured business intelligence"
APP_ICON: str = "⚡"  # lightning bolt

MODEL_NAME: str = "gemini-1.5-flash"

# Generation config for Gemini JSON mode. response_mime_type forces a single
# JSON object so we no longer have to scrape fenced code blocks as the primary
# path. Low temperature keeps the structure consistent across runs.
GENERATION_CONFIG: dict[str, Any] = {
    "response_mime_type": "application/json",
    "temperature": 0.2,
    "max_output_tokens": 1024,
    "candidate_count": 1,
}

# Input guardrails. We cap very long pastes to protect token budget / latency
# and reject trivially short input that produces garbage analysis.
MAX_INPUT_CHARS: int = 20_000
MIN_INPUT_CHARS: int = 20

# Number of analyses kept in the in-session history rail.
MAX_HISTORY: int = 10

# --------------------------------------------------------------------------- #
# Theme tokens (cohesive teal). Kept here so app.py / display.py share one source.
# --------------------------------------------------------------------------- #

TEAL: str = "#008080"
TEAL_DEEP: str = "#0a5d5d"
TEAL_SOFT: str = "rgba(0, 128, 128, 0.12)"
INK: str = "#0f2424"
DIM: str = "#5f7575"
BG: str = "#f4f8f8"
SURFACE: str = "#ffffff"
BORDER: str = "#dceaea"

# Sentiment vocabulary the rest of the app relies on.
SENTIMENT_LABELS: tuple[str, ...] = ("Positive", "Neutral", "Negative")

SENTIMENT_COLORS: dict[str, str] = {
    "Positive": "#16A085",
    "Neutral": "#E0A800",
    "Negative": "#E74C3C",
}

SENTIMENT_EMOJI: dict[str, str] = {
    "Positive": "\U0001F7E2",  # green circle
    "Neutral": "\U0001F7E1",   # yellow circle
    "Negative": "\U0001F534",  # red circle
}

# Categorical confidence band -> numeric score for the Plotly gauge.
BAND_TO_SCORE: dict[str, int] = {"High": 90, "Medium": 65, "Low": 35}
DEFAULT_CONFIDENCE_SCORE: int = 65

# --------------------------------------------------------------------------- #
# Typed error hierarchy. parser.py raises these; app.py maps each to a tailored,
# friendly UI message instead of leaking a raw stack trace.
# --------------------------------------------------------------------------- #


class SignalError(Exception):
    """Base class for all Signal-specific, user-facing errors."""


class MissingKeyError(SignalError):
    """Raised when no GOOGLE_API_KEY is configured."""


class APICallError(SignalError):
    """Raised when the Gemini API / network call fails."""


class EmptyResponseError(SignalError):
    """Raised when the model returns no usable text (e.g. safety block)."""


class MalformedJSONError(SignalError):
    """Raised when the model output cannot be parsed into JSON at all."""


# --------------------------------------------------------------------------- #
# PURE helpers (unit-tested offline) — no I/O, no st.*, no genai.
# --------------------------------------------------------------------------- #


def extract_json(raw: str) -> dict[str, Any]:
    """Parse a model response string into a dict, defensively.

    Strategy:
      1. ``json.loads`` the whole thing (the happy path with JSON mode).
      2. Strip markdown code fences and retry.
      3. Brace-depth scan: take the first ``{`` and its matching ``}`` and
         parse that slice. This survives leading prose / trailing junk and
         nested braces without relying on greedy regex.

    Args:
        raw: The raw text returned by the model.

    Returns:
        The decoded JSON object as a dict.

    Raises:
        MalformedJSONError: If no valid JSON object can be recovered.
    """
    if raw is None:
        raise MalformedJSONError("The model returned an empty response.")

    text = raw.strip()
    if not text:
        raise MalformedJSONError("The model returned an empty response.")

    # 1) Happy path.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # 2) Strip ```json ... ``` fences and retry.
    fenced = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    fenced = re.sub(r"\s*```$", "", fenced).strip()
    if fenced != text:
        try:
            parsed = json.loads(fenced)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    # 3) Brace-depth scan over the fence-stripped text.
    candidate = _slice_first_json_object(fenced)
    if candidate is not None:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    raise MalformedJSONError(
        "The model returned something that was not valid JSON."
    )


def _slice_first_json_object(text: str) -> str | None:
    """Return the substring from the first ``{`` to its matching ``}``.

    Walks the string tracking brace depth, while respecting string literals and
    escape sequences so braces inside quoted values do not confuse the count.

    Args:
        text: Text that may contain a JSON object surrounded by other content.

    Returns:
        The balanced ``{...}`` slice, or ``None`` if no balanced object exists.
    """
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def confidence_to_score(value: Any) -> int:
    """Coerce any confidence representation into an int in ``[0, 100]``.

    Accepts a numeric score (clamped), a categorical band ("High"/"Medium"/
    "Low", case-insensitive), or numeric strings like ``"85"`` / ``"85%"``.
    Anything unrecognized falls back to :data:`DEFAULT_CONFIDENCE_SCORE`.

    Args:
        value: A number, band string, or numeric string.

    Returns:
        An integer confidence score between 0 and 100.
    """
    # Numeric (int/float, but not bool which is an int subclass).
    if isinstance(value, bool):
        return DEFAULT_CONFIDENCE_SCORE
    if isinstance(value, (int, float)):
        return _clamp_score(value)

    if isinstance(value, str):
        token = value.strip()
        band = BAND_TO_SCORE.get(token.title())
        if band is not None:
            return band
        # Try a bare or percent-suffixed number, e.g. "85" or "85%".
        match = re.search(r"-?\d+(?:\.\d+)?", token)
        if match:
            try:
                return _clamp_score(float(match.group()))
            except ValueError:
                pass

    return DEFAULT_CONFIDENCE_SCORE


def _clamp_score(value: float) -> int:
    """Clamp a number into the inclusive ``[0, 100]`` integer range."""
    return max(0, min(100, int(round(value))))


def normalize_label(value: Any) -> str:
    """Coerce a sentiment label into one of :data:`SENTIMENT_LABELS`.

    Title-cases the input and defaults to ``"Neutral"`` on anything unknown,
    so the gauge color and emoji lookups can never miss.

    Args:
        value: The raw sentiment label from the model.

    Returns:
        Exactly one of ``"Positive"``, ``"Neutral"`` or ``"Negative"``.
    """
    if isinstance(value, str):
        candidate = value.strip().title()
        if candidate in SENTIMENT_LABELS:
            return candidate
    return "Neutral"


def _as_str_list(value: Any) -> list[str]:
    """Coerce a value into a clean ``list[str]``.

    A lone string becomes a single-item list; lists are stringified and emptied
    of blanks; anything else becomes an empty list.

    Args:
        value: A string, list, or arbitrary value.

    Returns:
        A list of non-empty strings.
    """
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    out: list[str] = []
    for item in value:
        if item is None:
            continue
        text = str(item).strip()
        if text:
            out.append(text)
    return out


def split_metric(metric: Any) -> dict[str, str]:
    """Normalize a metric into ``{"label", "value", "change"}``.

    Handles two shapes the model may emit:
      * an object ``{"label": "...", "value": "...", "change": "..."}``
      * a flat string like ``"Q3 revenue rose 14% to $2.1B"`` — in which case we
        extract the leading currency/number/percent token as the value and use
        the surrounding words as the label, plus any ``+/-N%`` as the change.

    Args:
        metric: A dict or string describing one metric.

    Returns:
        A dict with string ``label``, ``value`` and ``change`` (change may be "").
    """
    if isinstance(metric, dict):
        label = str(metric.get("label", "") or "").strip()
        value = str(metric.get("value", "") or "").strip()
        change = str(metric.get("change", "") or "").strip()
        if not value and label:
            # Some models put everything in label; fall back to string parsing.
            parsed = _split_metric_string(label)
            return parsed
        return {
            "label": label or "Metric",
            "value": value or "—",
            "change": change,
        }
    return _split_metric_string(str(metric or ""))


# A "rich" value carries a currency symbol, a percent sign, or a magnitude word
# (e.g. $4.2B, 14%, 2.1 billion). We prefer these over a bare digit so "Q3" does
# not get mistaken for the metric value.
_RICH_VALUE_TOKEN = re.compile(
    r"""
    (?:
        [$€£¥]\s?[-+]?\d[\d,]*(?:\.\d+)?\s?
            (?:[KkMmBbTt]\b|trillion|billion|million|thousand)?   # $4.2B
      | [-+]?\d[\d,]*(?:\.\d+)?\s?%                                # 14%
      | [-+]?\d[\d,]*(?:\.\d+)?\s?
            (?:[KkMmBbTt]\b|trillion|billion|million|thousand)     # 2.1 billion
    )
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Fallback: any bare number (1,200) when no rich token exists.
_PLAIN_VALUE_TOKEN = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")

_CHANGE_TOKEN = re.compile(r"[-+]\d[\d,]*(?:\.\d+)?\s?%")


def _split_metric_string(text: str) -> dict[str, str]:
    """Best-effort split of a flat metric string into label/value/change."""
    text = text.strip()
    if not text:
        return {"label": "Metric", "value": "—", "change": ""}

    change = ""
    change_match = _CHANGE_TOKEN.search(text)
    if change_match:
        change = change_match.group().replace(" ", "")

    value = ""
    value_match = _RICH_VALUE_TOKEN.search(text) or _PLAIN_VALUE_TOKEN.search(text)
    if value_match and value_match.group().strip():
        value = value_match.group().strip()

    if not value:
        # No number at all — show the whole thing as the value, no label.
        return {"label": "", "value": text, "change": change}

    # Use the words before the value as the label; fall back to trailing words.
    head = text[: value_match.start()].strip(" .,:;-")
    tail = text[value_match.end():].strip(" .,:;-")
    label = head or tail or "Metric"
    # Keep labels tidy and not absurdly long.
    if len(label) > 60:
        label = label[:57].rstrip() + "…"
    return {"label": label, "value": value, "change": change}


def normalize_results(raw: Any) -> dict[str, Any]:
    """Coerce a raw model dict into the exact shape ``render_results`` expects.

    Guarantees (so the UI can never hit a ``KeyError`` / ``TypeError``):
      * ``summary``: str
      * ``entities``: dict with ``companies`` / ``people`` / ``places`` lists
      * ``metrics``: list of ``{"label", "value", "change"}`` dicts
      * ``sentiment``: dict with ``label`` (one of SENTIMENT_LABELS),
        ``confidence`` (band string, back-compat), ``confidence_score`` (int
        0-100) and ``reasoning`` (str)
      * ``topics``: list[str] truncated to 5

    Args:
        raw: The decoded model output (ideally a dict; other types are tolerated).

    Returns:
        A fully-populated, well-typed results dict.
    """
    data: dict[str, Any] = raw if isinstance(raw, dict) else {}

    # Summary.
    summary = data.get("summary")
    summary = str(summary).strip() if summary else "No summary was returned."

    # Entities -> dict of three string lists.
    raw_entities = data.get("entities")
    if not isinstance(raw_entities, dict):
        raw_entities = {}
    entities = {
        "companies": _as_str_list(raw_entities.get("companies")),
        "people": _as_str_list(raw_entities.get("people")),
        "places": _as_str_list(raw_entities.get("places")),
    }

    # Metrics -> list of normalized dicts.
    raw_metrics = data.get("metrics")
    if isinstance(raw_metrics, (str, dict)):
        raw_metrics = [raw_metrics]
    if not isinstance(raw_metrics, (list, tuple)):
        raw_metrics = []
    metrics = [split_metric(m) for m in raw_metrics if m not in (None, "")]

    # Sentiment.
    raw_sentiment = data.get("sentiment")
    if not isinstance(raw_sentiment, dict):
        raw_sentiment = {}
    label = normalize_label(raw_sentiment.get("label"))
    # Prefer an explicit numeric score; otherwise derive from the band.
    if "confidence_score" in raw_sentiment:
        score = confidence_to_score(raw_sentiment.get("confidence_score"))
    else:
        score = confidence_to_score(raw_sentiment.get("confidence"))
    # Keep the categorical band too (back-compat for old session/JSON entries).
    band = raw_sentiment.get("confidence")
    if not (isinstance(band, str) and band.strip().title() in BAND_TO_SCORE):
        band = _score_to_band(score)
    else:
        band = band.strip().title()
    reasoning = raw_sentiment.get("reasoning")
    reasoning = str(reasoning).strip() if reasoning else ""

    sentiment = {
        "label": label,
        "confidence": band,
        "confidence_score": score,
        "reasoning": reasoning,
    }

    # Topics -> list[str], max 5.
    topics = _as_str_list(data.get("topics"))[:5]

    return {
        "summary": summary,
        "entities": entities,
        "metrics": metrics,
        "sentiment": sentiment,
        "topics": topics,
    }


def _score_to_band(score: int) -> str:
    """Map a numeric confidence score back into a categorical band."""
    if score >= 80:
        return "High"
    if score >= 50:
        return "Medium"
    return "Low"


def build_markdown_report(
    results: dict[str, Any], generated_at: datetime | None = None
) -> str:
    """Render a normalized results dict as a clean, paste-ready Markdown report.

    The output is meant to drop straight into Notion / Slack / an email and stay
    formatted: an H1, a blockquote summary, a sentiment line, grouped entity
    bullets, a metrics table and ``#topic`` tags. This is a pure function (no
    network) and is exercised by the offline test suite.

    Args:
        results: A results dict (run through :func:`normalize_results` first).
        generated_at: Optional timestamp for the footer; defaults to "now".

    Returns:
        A Markdown document as a string.
    """
    data = normalize_results(results)
    when = generated_at or datetime.now()
    lines: list[str] = []

    lines.append("# Signal Intelligence Report")
    lines.append("")
    lines.append("## Executive Summary")
    lines.append(f"> {data['summary']}")
    lines.append("")

    sent = data["sentiment"]
    lines.append("## Sentiment")
    lines.append(
        f"**{sent['label']}** — confidence "
        f"{sent['confidence_score']}/100 ({sent['confidence']})"
    )
    if sent["reasoning"]:
        lines.append("")
        lines.append(f"_{sent['reasoning']}_")
    lines.append("")

    lines.append("## Key Entities")
    entities = data["entities"]
    any_entity = False
    for key, heading in (
        ("companies", "Companies"),
        ("people", "People"),
        ("places", "Places"),
    ):
        items = entities.get(key, [])
        if items:
            any_entity = True
            lines.append(f"**{heading}**")
            for item in items:
                lines.append(f"- {item}")
            lines.append("")
    if not any_entity:
        lines.append("_No named entities found._")
        lines.append("")

    lines.append("## Numbers & Metrics")
    metrics = data["metrics"]
    if metrics:
        lines.append("| Metric | Value | Change |")
        lines.append("| --- | --- | --- |")
        for m in metrics:
            label = m["label"] or "—"
            change = m["change"] or "—"
            lines.append(f"| {label} | {m['value']} | {change} |")
    else:
        lines.append("_No specific metrics found._")
    lines.append("")

    lines.append("## Topics")
    topics = data["topics"]
    if topics:
        lines.append(" ".join(f"`#{t}`" for t in topics))
    else:
        lines.append("_No topics identified._")
    lines.append("")

    lines.append("---")
    lines.append(f"_Generated by Signal • {when:%Y-%m-%d %H:%M}_")
    return "\n".join(lines)


def safe_html(value: Any) -> str:
    """HTML-escape any model-supplied string before injecting into custom HTML.

    Args:
        value: A value to be embedded inside ``unsafe_allow_html`` markup.

    Returns:
        An HTML-escaped string safe for interpolation.
    """
    return html.escape(str(value), quote=True)
