"""Offline unit tests for Signal's PURE helper functions.

These tests import ONLY ``utils.constants`` — no streamlit, no genai, no network,
no API key. They cover the defensive JSON extraction and the result
normalization that make ``render_results`` impossible to crash on a bad model
response. Run with ``pytest`` or directly with ``python tests/test_parser.py``.
"""

from __future__ import annotations

import os
import sys

# Allow running directly (python tests/test_parser.py) without installing.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.constants import (  # noqa: E402
    BAND_TO_SCORE,
    DEFAULT_CONFIDENCE_SCORE,
    MalformedJSONError,
    build_markdown_report,
    confidence_to_score,
    extract_json,
    normalize_label,
    normalize_results,
    split_metric,
)


# --------------------------------------------------------------------------- #
# extract_json
# --------------------------------------------------------------------------- #


def test_extract_json_clean():
    assert extract_json('{"a": 1, "b": "x"}') == {"a": 1, "b": "x"}


def test_extract_json_fenced_block():
    raw = '```json\n{"a": 1}\n```'
    assert extract_json(raw) == {"a": 1}


def test_extract_json_leading_prose_and_trailing_junk():
    raw = 'Here is your JSON:\n{"a": 1, "b": 2}\nHope that helps!'
    assert extract_json(raw) == {"a": 1, "b": 2}


def test_extract_json_nested_braces():
    raw = 'prefix {"outer": {"inner": [1, 2]}, "k": "v"} suffix'
    assert extract_json(raw) == {"outer": {"inner": [1, 2]}, "k": "v"}


def test_extract_json_brace_inside_string_value():
    raw = '{"note": "use { and } carefully", "n": 3}'
    assert extract_json(raw) == {"note": "use { and } carefully", "n": 3}


def test_extract_json_empty_raises():
    for bad in ("", "   ", None):
        try:
            extract_json(bad)  # type: ignore[arg-type]
            assert False, f"expected MalformedJSONError for {bad!r}"
        except MalformedJSONError:
            pass


def test_extract_json_garbage_raises():
    try:
        extract_json("this is not json at all")
        assert False, "expected MalformedJSONError"
    except MalformedJSONError:
        pass


# --------------------------------------------------------------------------- #
# confidence_to_score
# --------------------------------------------------------------------------- #


def test_confidence_band_mapping():
    assert confidence_to_score("High") == BAND_TO_SCORE["High"]
    assert confidence_to_score("medium") == BAND_TO_SCORE["Medium"]
    assert confidence_to_score("LOW") == BAND_TO_SCORE["Low"]


def test_confidence_numeric():
    assert confidence_to_score(88) == 88
    assert confidence_to_score(150) == 100  # clamped
    assert confidence_to_score(-5) == 0     # clamped
    assert confidence_to_score("85%") == 85


def test_confidence_unknown_default():
    assert confidence_to_score("banana") == DEFAULT_CONFIDENCE_SCORE
    assert confidence_to_score(None) == DEFAULT_CONFIDENCE_SCORE
    assert confidence_to_score(True) == DEFAULT_CONFIDENCE_SCORE  # bool guarded


# --------------------------------------------------------------------------- #
# normalize_label
# --------------------------------------------------------------------------- #


def test_normalize_label():
    assert normalize_label("positive") == "Positive"
    assert normalize_label("NEGATIVE") == "Negative"
    assert normalize_label("bullish") == "Neutral"   # unknown -> Neutral
    assert normalize_label(None) == "Neutral"


# --------------------------------------------------------------------------- #
# split_metric
# --------------------------------------------------------------------------- #


def test_split_metric_object_passthrough():
    m = split_metric({"label": "Revenue", "value": "$4.2B", "change": "+27%"})
    assert m == {"label": "Revenue", "value": "$4.2B", "change": "+27%"}


def test_split_metric_string_with_currency():
    m = split_metric("Q3 revenue rose to $2.1B")
    assert m["value"] == "$2.1B"
    assert "revenue" in m["label"].lower()


def test_split_metric_string_with_percent_change():
    m = split_metric("Operating margin expanded +7% to 31%")
    assert m["change"] == "+7%"
    assert m["value"]  # something numeric was captured


def test_split_metric_no_number():
    m = split_metric("Strong demand across regions")
    assert m["value"] == "Strong demand across regions"


# --------------------------------------------------------------------------- #
# normalize_results
# --------------------------------------------------------------------------- #


def test_normalize_results_fills_missing_keys():
    out = normalize_results({})
    assert set(out) == {"summary", "entities", "metrics", "sentiment", "topics"}
    assert out["entities"] == {"companies": [], "people": [], "places": []}
    assert out["metrics"] == []
    assert out["topics"] == []
    assert out["sentiment"]["label"] == "Neutral"
    assert 0 <= out["sentiment"]["confidence_score"] <= 100


def test_normalize_results_wraps_stray_string_entity():
    out = normalize_results({"entities": {"companies": "Acme"}})
    assert out["entities"]["companies"] == ["Acme"]


def test_normalize_results_unknown_sentiment_label():
    out = normalize_results({"sentiment": {"label": "ecstatic"}})
    assert out["sentiment"]["label"] == "Neutral"


def test_normalize_results_truncates_topics_to_five():
    out = normalize_results({"topics": ["a", "b", "c", "d", "e", "f", "g"]})
    assert out["topics"] == ["a", "b", "c", "d", "e"]


def test_normalize_results_band_to_score_backfill():
    out = normalize_results({"sentiment": {"label": "Positive", "confidence": "High"}})
    assert out["sentiment"]["confidence_score"] == BAND_TO_SCORE["High"]
    assert out["sentiment"]["confidence"] == "High"


def test_normalize_results_numeric_score_drives_band():
    out = normalize_results(
        {"sentiment": {"label": "Positive", "confidence_score": 92}}
    )
    assert out["sentiment"]["confidence_score"] == 92
    assert out["sentiment"]["confidence"] == "High"


def test_normalize_results_string_metrics_become_objects():
    out = normalize_results({"metrics": ["Revenue grew to $4.2B"]})
    assert isinstance(out["metrics"][0], dict)
    assert out["metrics"][0]["value"] == "$4.2B"


def test_normalize_results_handles_non_dict_input():
    # A list / string / None must not crash; defaults are produced.
    for bad in (None, "oops", [1, 2, 3]):
        out = normalize_results(bad)  # type: ignore[arg-type]
        assert out["sentiment"]["label"] == "Neutral"


# --------------------------------------------------------------------------- #
# build_markdown_report
# --------------------------------------------------------------------------- #


def test_build_markdown_report_structure():
    results = normalize_results(
        {
            "summary": "Sentence one. Sentence two.",
            "entities": {"companies": ["Acme"], "people": [], "places": []},
            "metrics": [{"label": "Revenue", "value": "$4.2B", "change": "+27%"}],
            "sentiment": {"label": "Positive", "confidence_score": 90},
            "topics": ["earnings", "saas"],
        }
    )
    md = build_markdown_report(results)
    assert "# Signal Intelligence Report" in md
    assert "> Sentence one. Sentence two." in md
    assert "| Metric | Value | Change |" in md
    assert "Acme" in md
    assert "`#earnings`" in md
    assert "Positive" in md


def _run_all() -> int:
    """Run every test_* function in this module without pytest."""
    funcs = [
        v
        for k, v in sorted(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    failures = 0
    for fn in funcs:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"FAIL  {fn.__name__}: {exc}")
        except Exception as exc:  # unexpected error
            failures += 1
            print(f"ERROR {fn.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(funcs) - failures}/{len(funcs)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
