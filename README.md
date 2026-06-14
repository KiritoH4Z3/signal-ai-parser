# Signal — AI Market Intelligence Parser

Signal converts unstructured text — news articles, market updates, reports, emails — into structured business intelligence using Google Gemini, so you can read the signal instead of the noise.

## Results
- Extracts entities, metrics, sentiment and an executive summary in under 3 seconds
- Returns a strict JSON schema: 2-sentence summary, companies/people/places, numeric metrics, sentiment with confidence, and up to 5 topic tags
- One-click JSON export of every report

## Tech Stack
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Streamlit](https://img.shields.io/badge/Streamlit-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)

## Architecture
A Streamlit front end (`app.py`) collects raw text and renders the results. `utils/parser.py` sends the text to the `gemini-1.5-flash` model with a strict prompt that forces a single JSON object, then sanitizes and parses the response. `utils/display.py` renders the structured output — summary, two-column entities/sentiment, topic chips, metric cards and a JSON download button.

## How to Run

```bash
git clone https://github.com/KiritoH4Z3/signal-ai-parser.git
cd signal-ai-parser
pip install -r requirements.txt

# Add your API key
mkdir -p .streamlit
cp secrets_template.toml .streamlit/secrets.toml
# then edit .streamlit/secrets.toml and set GOOGLE_API_KEY
# (get a free key at https://aistudio.google.com)

streamlit run app.py
```

## Deployment (Streamlit Community Cloud)
1. Push this repo to GitHub.
2. Go to [share.streamlit.io](https://share.streamlit.io) and connect the `KiritoH4Z3/signal-ai-parser` repo.
3. Set the main file to `app.py`.
4. In **Advanced settings → Secrets**, add:
   ```toml
   GOOGLE_API_KEY = "your_google_ai_studio_api_key_here"
   ```
5. Click **Deploy**.

## Author
Built by **Abdullah Mohammed Hazeq** — [LinkedIn](https://linkedin.com/in/abdullahmhazeq) · [GitHub](https://github.com/KiritoH4Z3)
