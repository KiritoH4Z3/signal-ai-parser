# Signal — AI Market Intelligence Parser

I read a lot of earnings notes and market emails for fun (yes, I know how that sounds), and I got tired of skimming three paragraphs to find the one number that mattered. So I built Signal: paste any messy text — a news article, an earnings note, a "quick question" email that is never quick — and Google Gemini hands back a clean, structured intelligence report. You read the signal, not the noise.

## Tech Stack
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Plotly](https://img.shields.io/badge/Plotly-3F4F75?style=for-the-badge&logo=plotly&logoColor=white)
![Pytest](https://img.shields.io/badge/Pytest-0A9EDC?style=for-the-badge&logo=pytest&logoColor=white)

## What you get
Every analysis returns one strict JSON object:
- A **2-sentence executive summary** — the headline, nothing more
- **Key entities** grouped into companies / people / places
- **Numbers and metrics** pulled straight from the text, as real KPI cards
- **Sentiment** (Positive / Neutral / Negative) with a confidence score on a Plotly gauge
- Up to **5 topic tags**

## Why it doesn't fall over
The first version parsed JSON by stripping markdown fences with regex and praying. This one is built so the UI literally cannot throw a stack trace at you:

- **Gemini JSON mode** (`response_mime_type="application/json"`, low temperature) so the model returns a single JSON object as the primary path — no fence-scraping.
- **Two-layer defensive parsing**: if JSON mode ever drifts, a pure `extract_json()` helper does a brace-depth scan (string-and-escape aware) to recover the object from stray prose.
- **Normalization**: every result is run through `normalize_results()`, which fills missing keys, coerces stray strings into lists, clamps the confidence score to 0–100, and forces the sentiment label into a known value. The renderer always gets a well-typed dict.
- **Typed errors → friendly UI**: missing API key, API/network failure, empty/blocked response, and malformed JSON each map to a specific, on-brand message — never a red traceback. Yank the key, paste an emoji, paste a novel, or hit a flagged input and you still get a calm explanation.
- **No-key preview mode**: if there's no key (or the cloud secret lapses), the example buttons serve pre-baked results, so the deployed link is never a dead app.

## Demo it in one click
Three "Try an example" buttons up top — a news snippet, an earnings note, and a business email — each runs a full analysis with zero typing. The earnings note fills the metric cards, the news snippet fills the entity chips, and the email is deliberately sentiment-ambiguous so you can watch the model reason rather than just print 99%.

## Provably correct, offline
The parsing and normalization logic lives in `utils/constants.py`, which imports **no** Streamlit and **no** Gemini SDK. That means `tests/test_parser.py` runs in well under a second with **no API key and no network** — and it runs in CI on every push (`.github/workflows/tests.yml`).

```bash
pytest tests/ -q          # or: python tests/test_parser.py
```

## Architecture
- `app.py` — Streamlit UI: hero header, the example gallery, a live character counter, an in-session history rail you can click to revisit past analyses, and all the friendly error states.
- `utils/parser.py` — `extract_intelligence(text) -> dict`. Reads the key safely, calls Gemini in JSON mode (model cached so the SDK isn't re-initialized on every click), retries once on transient failures, and safely extracts text from the response without tripping over safety blocks.
- `utils/display.py` — `render_results(results)`. The Plotly confidence gauge (colored by sentiment), styled entity chips, hashtag topic tags, KPI metric cards, and dual export: JSON **and** a paste-ready Markdown report.
- `utils/constants.py` — config, theme tokens, the typed exception hierarchy, and all the pure helpers.
- `utils/examples.py` — sample texts and their pre-baked results.

The public contract is preserved: `extract_intelligence(text: str) -> dict` and `render_results(results: dict)`.

## Run it locally
```bash
git clone https://github.com/KiritoH4Z3/signal-ai-parser.git
cd signal-ai-parser
pip install -r requirements.txt

# Add your API key (a free Google AI Studio key works fine)
mkdir -p .streamlit
cp secrets_template.toml .streamlit/secrets.toml
# then edit .streamlit/secrets.toml and set GOOGLE_API_KEY
# grab one at https://aistudio.google.com

streamlit run app.py
```

No key handy? Run it anyway — preview mode and the example buttons still work.

## Deploy (Streamlit Community Cloud)
1. Push this repo to GitHub.
2. Go to [share.streamlit.io](https://share.streamlit.io) and connect `KiritoH4Z3/signal-ai-parser`.
3. Set the main file to `app.py`.
4. In **Advanced settings → Secrets**, add:
   ```toml
   GOOGLE_API_KEY = "your_google_ai_studio_api_key_here"
   ```
5. Click **Deploy**.

## Author
Built by **Abdullah Mohammed Hazeq**.

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/KiritoH4Z3)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/abdullahmhazeq)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:ahazeq.mena@gmail.com)
