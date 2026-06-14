import streamlit as st

def render_results(results: dict):
    st.markdown("---")
    st.markdown("## Intelligence Report")

    # Summary
    st.markdown("### Executive Summary")
    st.info(results.get("summary", "No summary available"))

    col1, col2 = st.columns(2)

    with col1:
        # Entities
        st.markdown("### Key Entities")
        entities = results.get("entities", {})

        if entities.get("companies"):
            st.markdown("**Companies**")
            for c in entities["companies"]:
                st.markdown(f"- {c}")

        if entities.get("people"):
            st.markdown("**People**")
            for p in entities["people"]:
                st.markdown(f"- {p}")

        if entities.get("places"):
            st.markdown("**Places**")
            for pl in entities["places"]:
                st.markdown(f"- {pl}")

        if not any(entities.values()):
            st.markdown("*No named entities found*")

    with col2:
        # Sentiment
        st.markdown("### Sentiment")
        sentiment = results.get("sentiment", {})
        label = sentiment.get("label", "Neutral")
        confidence = sentiment.get("confidence", "Medium")
        reasoning = sentiment.get("reasoning", "")

        color = {"Positive": "🟢", "Neutral": "🟡", "Negative": "🔴"}.get(label, "🟡")
        st.markdown(f"{color} **{label}** — Confidence: {confidence}")
        st.caption(reasoning)

        # Topics
        st.markdown("### Topics")
        topics = results.get("topics", [])
        if topics:
            topic_html = " ".join([f'<span style="background-color:#008080;color:white;padding:3px 10px;border-radius:12px;margin:3px;display:inline-block">{t}</span>' for t in topics])
            st.markdown(topic_html, unsafe_allow_html=True)

    # Metrics
    st.markdown("### Numbers and Metrics")
    metrics = results.get("metrics", [])
    if metrics:
        cols = st.columns(min(len(metrics), 3))
        for i, metric in enumerate(metrics):
            with cols[i % 3]:
                st.metric(label=f"Metric {i+1}", value=metric)
    else:
        st.markdown("*No specific metrics found in text*")

    # Download
    import json
    st.download_button(
        label="Download as JSON",
        data=json.dumps(results, indent=2),
        file_name="signal_output.json",
        mime="application/json"
    )
