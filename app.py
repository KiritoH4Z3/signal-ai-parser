import streamlit as st
from utils.parser import extract_intelligence
from utils.display import render_results

st.set_page_config(
    page_title="Signal — AI Intelligence Parser",
    page_icon="⚡",
    layout="wide"
)

# Custom CSS for teal theme
st.markdown("""
<style>
.main-header {
    color: #008080;
    font-size: 2.5rem;
    font-weight: bold;
}
.sub-header {
    color: #666;
    font-size: 1rem;
    margin-bottom: 2rem;
}
</style>
""", unsafe_allow_html=True)

with st.sidebar:
    st.markdown("## ⚡ Signal")
    st.markdown("**AI Market Intelligence Parser**")
    st.markdown("---")
    st.markdown("Paste any unstructured text and Signal extracts structured business intelligence in seconds.")
    st.markdown("**What Signal extracts:**")
    st.markdown("- Executive summary\n- Key entities\n- Numbers and metrics\n- Sentiment\n- Topic tags")
    st.markdown("---")
    st.markdown("Built by Abdullah Mohammed Hazeq")
    st.markdown("[GitHub](https://github.com/KiritoH4Z3) | [LinkedIn](https://linkedin.com/in/abdullahmhazeq)")

st.markdown('<p class="main-header">⚡ Signal</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Convert unstructured text into structured business intelligence</p>', unsafe_allow_html=True)

text_input = st.text_area(
    "Paste your text here",
    height=200,
    placeholder="Paste any news article, market update, report, email or document..."
)

if st.button("Extract Intelligence", type="primary", use_container_width=True):
    if not text_input.strip():
        st.warning("Please paste some text first.")
    else:
        with st.spinner("Extracting intelligence..."):
            try:
                results = extract_intelligence(text_input)
                render_results(results)
            except Exception as e:
                st.error(f"Error: {str(e)}")
                st.info("Make sure your GOOGLE_API_KEY is set in Streamlit secrets.")
