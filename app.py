"""Signal — AI Market Intelligence Parser (Streamlit entry point).

Paste raw text and Gemini returns a structured intelligence report: a two-sentence
executive summary, key entities, numbers/metrics, sentiment with a confidence
gauge, and topic tags. This file wires the UI to ``extract_intelligence`` (parser)
and ``render_results`` (display) and owns the friendly error states, the
"Try an example" control, the live character counter and the in-session history.
"""

from __future__ import annotations

from datetime import datetime

import streamlit as st

from utils.constants import (
    APICallError,
    APP_ICON,
    APP_NAME,
    APP_TAGLINE,
    BORDER,
    DIM,
    EmptyResponseError,
    INK,
    MAX_HISTORY,
    MAX_INPUT_CHARS,
    MIN_INPUT_CHARS,
    MODEL_NAME,
    MalformedJSONError,
    MissingKeyError,
    SENTIMENT_COLORS,
    SignalError,
    TEAL,
    TEAL_DEEP,
)
from utils.display import render_results
from utils.examples import EXAMPLES, EXAMPLE_RESULTS
from utils.parser import extract_intelligence, has_api_key

st.set_page_config(
    page_title="Signal — AI Intelligence Parser",
    page_icon=APP_ICON,
    layout="wide",
)


# --------------------------------------------------------------------------- #
# Theme
# --------------------------------------------------------------------------- #


def inject_css() -> None:
    """Inject the cohesive teal theme + Inter font and hide default chrome."""
    st.markdown(
        f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        html, body, [class*="css"], .stApp {{ font-family: 'Inter', sans-serif; }}
        .stApp {{
            background:
              radial-gradient(900px 500px at 12% -8%, rgba(0,128,128,0.10), transparent 60%),
              #f4f8f8;
        }}
        #MainMenu, footer {{ visibility: hidden; }}
        .block-container {{ padding-top: 1.6rem; }}
        .sig-hero {{
            background: linear-gradient(135deg, {TEAL} 0%, {TEAL_DEEP} 100%);
            border-radius: 18px; padding: 26px 32px; color: #fff;
            box-shadow: 0 18px 40px -22px rgba(10,61,61,.6); margin-bottom: 1.2rem;
        }}
        .sig-hero h1 {{
            margin: 0; font-size: 2.3rem; font-weight: 800; letter-spacing: -0.02em; color:#fff;
        }}
        .sig-hero p {{ margin: .35rem 0 0; color: rgba(255,255,255,.85); font-size: 1.02rem; }}
        .sig-badge {{
            display:inline-flex; align-items:center; justify-content:center;
            width:46px; height:46px; border-radius:50%;
            background: rgba(255,255,255,.18); font-size:1.5rem; margin-right:14px;
        }}
        .sig-pill {{
            display:inline-block; background: rgba(255,255,255,.16);
            border:1px solid rgba(255,255,255,.25); color:#fff;
            padding:3px 11px; border-radius:999px; font-size:.74rem;
            margin:8px 6px 0 0;
        }}
        .stTextArea textarea {{
            border-radius: 12px !important; border: 1px solid {BORDER} !important;
        }}
        div.stButton > button[kind="primary"] {{
            background: linear-gradient(135deg, {TEAL}, {TEAL_DEEP});
            border: none; font-weight: 600;
        }}
        .sig-empty {{
            border: 1px dashed {BORDER}; border-radius: 14px; padding: 34px;
            text-align: center; color: {DIM}; background: rgba(255,255,255,.5);
        }}
        section[data-testid="stSidebar"] {{ border-right: 1px solid {BORDER}; }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_hero() -> None:
    """Render the gradient hero header with feature pills."""
    st.markdown(
        f"""
        <div class="sig-hero">
          <div style="display:flex;align-items:center;">
            <span class="sig-badge">{APP_ICON}</span>
            <div>
              <h1>{APP_NAME}</h1>
              <p>{APP_TAGLINE}</p>
            </div>
          </div>
          <div>
            <span class="sig-pill">JSON-strict output</span>
            <span class="sig-pill">Gemini 1.5 Flash</span>
            <span class="sig-pill">Sub-3s parse</span>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# --------------------------------------------------------------------------- #
# Session state
# --------------------------------------------------------------------------- #


def _init_state() -> None:
    """Initialize session_state keys used across reruns."""
    st.session_state.setdefault("text_input", "")
    st.session_state.setdefault("history", [])  # list[dict]
    st.session_state.setdefault("current", None)  # currently shown results
    st.session_state.setdefault("pending_example", None)  # (label, text) to run


def _push_history(text: str, results: dict, source: str) -> None:
    """Record an analysis in the capped in-session history rail."""
    preview = " ".join(text.split())[:60]
    entry = {
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "preview": preview + ("…" if len(text) > 60 else ""),
        "sentiment": results.get("sentiment", {}).get("label", "Neutral"),
        "source": source,
        "results": results,
    }
    st.session_state.history.insert(0, entry)
    del st.session_state.history[MAX_HISTORY:]


def _run_analysis(text: str, source: str, allow_canned: bool) -> None:
    """Analyze text, store the result, and surface friendly errors.

    Args:
        text: The text to analyze.
        source: A short label for where the text came from (history metadata).
        allow_canned: If True and no key is configured, fall back to a pre-baked
            result when ``source`` matches a known example label.
    """
    if not has_api_key():
        if allow_canned and source in EXAMPLE_RESULTS:
            results = EXAMPLE_RESULTS[source]
            st.session_state.current = results
            _push_history(text, results, source + " (preview)")
            st.toast("Showing a pre-baked example (no API key set).", icon="🧪")
            return
        st.session_state.current = None
        _no_key_panel()
        return

    with st.spinner("Reading the signal…"):
        try:
            results = extract_intelligence(text)
        except MissingKeyError:
            _no_key_panel()
            return
        except EmptyResponseError as exc:
            st.error(f"Nothing to report. {exc}")
            return
        except MalformedJSONError:
            st.error("The model returned an unexpected format.")
            st.info("Try a shorter or cleaner snippet, then run it again.")
            return
        except APICallError as exc:
            st.error(str(exc))
            st.info("This is usually transient — click the button again in a moment.")
            return
        except SignalError as exc:
            st.error(str(exc))
            return
        except Exception as exc:  # final safety net — never a raw traceback
            st.error("Something unexpected went wrong while analyzing the text.")
            st.caption(f"Details: {exc}")
            return

    st.session_state.current = results
    _push_history(text, results, source)


def _no_key_panel() -> None:
    """Render a friendly amber no-key onboarding panel (never a traceback)."""
    st.markdown(
        f"""
        <div style="background:rgba(224,168,0,.10);border:1px solid rgba(224,168,0,.4);
                    border-radius:12px;padding:16px 20px;color:{INK};">
          <strong>Running in preview mode — no API key found.</strong><br>
          Add a <code>GOOGLE_API_KEY</code> in Streamlit secrets to analyze your own
          text. You can still try the examples above to see a full report.<br>
          Grab a free key at
          <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a>,
          then add it to <code>.streamlit/secrets.toml</code>:
          <pre style="background:rgba(0,0,0,.04);padding:8px;border-radius:8px;margin-top:8px;">GOOGLE_API_KEY = "your_key_here"</pre>
        </div>
        """,
        unsafe_allow_html=True,
    )


# --------------------------------------------------------------------------- #
# Sidebar
# --------------------------------------------------------------------------- #


def render_sidebar() -> None:
    """Render the sidebar: about, status, and clickable history rail."""
    with st.sidebar:
        st.markdown(f"## {APP_ICON} {APP_NAME}")
        st.markdown("**AI Market Intelligence Parser**")
        st.markdown(
            "Paste any unstructured text and Signal extracts structured "
            "business intelligence in seconds."
        )

        if has_api_key():
            st.success("API key detected", icon="✅")
        else:
            st.warning("No API key — preview mode", icon="🧪")

        st.markdown("**What Signal extracts**")
        st.markdown(
            "- Executive summary\n- Key entities\n- Numbers and metrics\n"
            "- Sentiment + confidence\n- Topic tags"
        )

        st.markdown("---")
        st.markdown("### Recent analyses")
        history = st.session_state.get("history", [])
        if not history:
            st.caption("Your analyses will show up here.")
        else:
            for i, entry in enumerate(history):
                dot = SENTIMENT_COLORS.get(entry["sentiment"], SENTIMENT_COLORS["Neutral"])
                st.markdown(
                    f"<div style='display:flex;align-items:center;gap:7px;margin-bottom:2px;'>"
                    f"<span style='width:9px;height:9px;border-radius:50%;background:{dot};'></span>"
                    f"<span style='font-size:.78rem;color:{DIM};'>{entry['timestamp']} · {entry['source']}</span>"
                    f"</div>",
                    unsafe_allow_html=True,
                )
                if st.button(
                    entry["preview"] or "(empty)",
                    key=f"hist_{i}",
                    use_container_width=True,
                ):
                    st.session_state.current = entry["results"]
                    st.rerun()
            if st.button("Clear history", use_container_width=True):
                st.session_state.history = []
                st.rerun()

        st.markdown("---")
        st.caption("Built by Abdullah Mohammed Hazeq")
        st.markdown(
            "[GitHub](https://github.com/KiritoH4Z3) · "
            "[LinkedIn](https://linkedin.com/in/abdullahmhazeq)"
        )


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def main() -> None:
    """Compose the page and handle interactions."""
    inject_css()
    _init_state()
    render_sidebar()
    render_hero()

    # If an example was queued on a previous run, run it now (once per click).
    pending = st.session_state.pop("pending_example", None)
    if pending is not None:
        label, sample = pending
        st.session_state.text_input = sample
        _run_analysis(sample, source=label, allow_canned=True)

    # Example gallery — one click to a full report, no typing needed.
    st.markdown("**Try an example**")
    cols = st.columns(len(EXAMPLES))
    for col, (label, sample) in zip(cols, EXAMPLES.items()):
        with col:
            if st.button(label, use_container_width=True, key=f"ex_{label}"):
                st.session_state.pending_example = (label, sample)
                st.rerun()

    # Input + live character counter.
    text_input = st.text_area(
        "Paste your text here",
        height=200,
        placeholder="Paste any news article, market update, report, email or document…",
        key="text_input",
    )
    n = len(text_input)
    over = n > MAX_INPUT_CHARS
    under = 0 < n < MIN_INPUT_CHARS
    counter_color = "#E74C3C" if over else ("#E0A800" if n > MAX_INPUT_CHARS * 0.9 else DIM)
    note = ""
    if over:
        note = f" — over the {MAX_INPUT_CHARS:,} cap, input will be truncated"
    elif under:
        note = f" — need at least {MIN_INPUT_CHARS} characters"
    st.markdown(
        f"<div style='text-align:right;font-size:.78rem;color:{counter_color};'>"
        f"{n:,} / {MAX_INPUT_CHARS:,} characters{note}</div>",
        unsafe_allow_html=True,
    )

    disabled = under
    if st.button(
        "Extract Intelligence",
        type="primary",
        use_container_width=True,
        disabled=disabled,
    ):
        if not text_input.strip():
            st.warning("Please paste some text first, or tap an example above.")
        else:
            _run_analysis(text_input, source="Manual", allow_canned=False)

    # Render the current report, or a friendly empty state.
    if st.session_state.current is not None:
        render_results(st.session_state.current)
    else:
        st.markdown(
            f"<div class='sig-empty'>"
            f"<div style='font-size:2rem;'>{APP_ICON}</div>"
            f"Paste text or tap an example above to see the report here."
            f"</div>",
            unsafe_allow_html=True,
        )

    st.caption(f"Model: {MODEL_NAME}")


if __name__ == "__main__":
    main()
