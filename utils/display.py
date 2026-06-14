"""Rendering of a Signal results dict in the Streamlit UI.

Public contract (do not break): ``render_results(results: dict)``.

All model-supplied strings are HTML-escaped via :func:`safe_html` before being
injected into custom HTML. The results dict is run through
:func:`normalize_results` so this module can assume a well-typed shape.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import plotly.graph_objects as go
import streamlit as st

from utils.constants import (
    BORDER,
    DIM,
    INK,
    SENTIMENT_COLORS,
    SURFACE,
    TEAL,
    TEAL_DEEP,
    build_markdown_report,
    normalize_results,
    safe_html,
)


def render_sentiment_gauge(label: str, confidence_score: int) -> go.Figure:
    """Build a Plotly confidence gauge colored by sentiment.

    Args:
        label: A normalized sentiment label (Positive/Neutral/Negative).
        confidence_score: An int in ``[0, 100]``.

    Returns:
        A styled, transparent-background ``go.Figure`` ready for embedding.
    """
    color = SENTIMENT_COLORS.get(label, SENTIMENT_COLORS["Neutral"])
    fig = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=confidence_score,
            number={"suffix": "%", "font": {"size": 34, "color": INK}},
            gauge={
                "axis": {
                    "range": [0, 100],
                    "tickwidth": 1,
                    "tickcolor": DIM,
                    "tickfont": {"size": 10, "color": DIM},
                },
                "bar": {"color": color, "thickness": 0.75},
                "bgcolor": "rgba(0,0,0,0)",
                "borderwidth": 0,
                "steps": [
                    {"range": [0, 100], "color": "rgba(0, 128, 128, 0.08)"},
                ],
            },
            title={
                "text": f"<b>{safe_html(label)}</b>",
                "font": {"size": 16, "color": color},
            },
        )
    )
    fig.update_layout(
        height=240,
        margin={"l": 24, "r": 24, "t": 48, "b": 8},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter, sans-serif"},
    )
    return fig


def _section(title: str) -> None:
    """Render a section header with a teal accent rule."""
    st.markdown(
        f"""
        <div style="display:flex;align-items:center;gap:.55rem;margin:1.4rem 0 .6rem;">
          <span style="width:4px;height:20px;background:{TEAL};border-radius:3px;"></span>
          <span style="font-size:1.12rem;font-weight:700;color:{INK};">{safe_html(title)}</span>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _summary_card(summary: str) -> None:
    """Render the executive summary as an editorial brief card."""
    st.markdown(
        f"""
        <div style="background:{SURFACE};border:1px solid {BORDER};
                    border-left:4px solid {TEAL};border-radius:12px;
                    padding:18px 22px;box-shadow:0 8px 24px -18px rgba(10,61,61,.4);">
          <div style="text-transform:uppercase;letter-spacing:.08em;
                      font-size:.72rem;color:{DIM};font-weight:700;margin-bottom:6px;">
            Executive Summary
          </div>
          <div style="font-size:1.05rem;line-height:1.6;color:{INK};">
            {safe_html(summary)}
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _entity_chips(entities: dict[str, list[str]]) -> None:
    """Render entities as flex-wrapped chips grouped by type with colored dots."""
    groups = [
        ("companies", "Companies", "\U0001F3E2", TEAL),       # building
        ("people", "People", "\U0001F464", TEAL_DEEP),         # bust
        ("places", "Places", "\U0001F4CD", "#64748b"),        # pin
    ]
    rendered_any = False
    for key, heading, icon, dot in groups:
        items = entities.get(key, [])
        if not items:
            continue
        rendered_any = True
        chips = "".join(
            f"""<span style="display:inline-flex;align-items:center;gap:6px;
                background:rgba(0,128,128,0.10);border:1px solid {BORDER};
                border-radius:999px;padding:5px 12px;margin:3px;font-size:.82rem;
                color:{INK};">
                <span style="width:7px;height:7px;border-radius:50%;
                background:{dot};display:inline-block;"></span>{icon} {safe_html(c)}</span>"""
            for c in items
        )
        st.markdown(
            f"""
            <div style="margin-bottom:.5rem;">
              <div style="font-size:.78rem;font-weight:700;color:{DIM};
                          text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">
                {safe_html(heading)}
              </div>
              <div style="display:flex;flex-wrap:wrap;">{chips}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    if not rendered_any:
        st.markdown(
            f"<span style='color:{DIM};font-style:italic;'>No named entities found.</span>",
            unsafe_allow_html=True,
        )


def _topic_tags(topics: list[str]) -> None:
    """Render topics as filled teal-gradient hashtag pills."""
    if not topics:
        st.markdown(
            f"<span style='color:{DIM};font-style:italic;'>No topics identified.</span>",
            unsafe_allow_html=True,
        )
        return
    tags = "".join(
        f"""<span style="display:inline-block;
            background:linear-gradient(135deg,{TEAL},{TEAL_DEEP});
            color:#fff;padding:5px 13px;border-radius:999px;margin:3px;
            font-size:.82rem;font-weight:500;
            box-shadow:0 4px 10px -4px rgba(0,128,128,.5);">#{safe_html(t)}</span>"""
        for t in topics
    )
    st.markdown(
        f"<div style='display:flex;flex-wrap:wrap;'>{tags}</div>",
        unsafe_allow_html=True,
    )


def _metric_cards(metrics: list[dict[str, str]]) -> None:
    """Render metrics as a responsive grid of accent-bordered KPI cards."""
    if not metrics:
        st.markdown(
            f"<span style='color:{DIM};font-style:italic;'>"
            "No specific metrics found in the text.</span>",
            unsafe_allow_html=True,
        )
        return
    cols = st.columns(min(len(metrics), 3))
    for i, metric in enumerate(metrics):
        value = safe_html(metric.get("value", "—"))
        label = safe_html(metric.get("label", ""))
        change = metric.get("change", "")
        delta_html = ""
        if change:
            up = change.strip().startswith("+")
            delta_color = SENTIMENT_COLORS["Positive"] if up else SENTIMENT_COLORS["Negative"]
            delta_html = (
                f"<div style='font-size:.8rem;font-weight:600;color:{delta_color};"
                f"margin-top:2px;'>{safe_html(change)}</div>"
            )
        with cols[i % 3]:
            st.markdown(
                f"""
                <div style="background:{SURFACE};border:1px solid {BORDER};
                            border-left:3px solid {TEAL};border-radius:10px;
                            padding:12px 14px;margin-bottom:10px;
                            box-shadow:0 6px 18px -16px rgba(10,61,61,.5);">
                  <div style="font-size:1.5rem;font-weight:700;color:{TEAL_DEEP};
                              line-height:1.2;">{value}</div>
                  <div style="font-size:.74rem;color:{DIM};text-transform:uppercase;
                              letter-spacing:.04em;margin-top:4px;">{label}</div>
                  {delta_html}
                </div>
                """,
                unsafe_allow_html=True,
            )


def _export_bar(results: dict[str, Any], key_prefix: str = "") -> None:
    """Render the JSON + Markdown download buttons side by side."""
    json_data = json.dumps(results, indent=2, ensure_ascii=False)
    md_data = build_markdown_report(results, datetime.now())
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    c1, c2 = st.columns(2)
    with c1:
        st.download_button(
            "⬇️ Download JSON",
            data=json_data,
            file_name=f"signal_{stamp}.json",
            mime="application/json",
            use_container_width=True,
            key=f"{key_prefix}dl_json",
        )
    with c2:
        st.download_button(
            "⬇️ Download Markdown report",
            data=md_data,
            file_name=f"signal_{stamp}.md",
            mime="text/markdown",
            use_container_width=True,
            key=f"{key_prefix}dl_md",
        )


def render_results(results: dict, key_prefix: str = "") -> None:
    """Render a full intelligence report from a results dict.

    The input is normalized first, so this never raises on a partial / odd dict.
    Layout: full-width summary brief, then a gauge + metrics row, then entities,
    then topics, then the export bar.

    Args:
        results: A results dict (normalized internally for safety).
        key_prefix: Optional prefix to keep Streamlit widget keys unique when
            the same report is rendered more than once (e.g. history revisit).
    """
    data = normalize_results(results)

    st.markdown("---")
    _summary_card(data["summary"])

    # Gauge (left) + metrics (right) share the impact zone.
    left, right = st.columns([0.4, 0.6])
    with left:
        _section("Sentiment")
        sent = data["sentiment"]
        fig = render_sentiment_gauge(sent["label"], sent["confidence_score"])
        st.plotly_chart(
            fig,
            use_container_width=True,
            config={"displayModeBar": False},
        )
        if sent["reasoning"]:
            st.caption(sent["reasoning"])
    with right:
        _section("Numbers & Metrics")
        _metric_cards(data["metrics"])

    _section("Key Entities")
    _entity_chips(data["entities"])

    _section("Topics")
    _topic_tags(data["topics"])

    st.markdown("<div style='margin-top:1.2rem;'></div>", unsafe_allow_html=True)
    _export_bar(data, key_prefix=key_prefix)
