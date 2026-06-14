import google.generativeai as genai
import streamlit as st
import json
import re

def extract_intelligence(text: str) -> dict:
    genai.configure(api_key=st.secrets["GOOGLE_API_KEY"])
    model = genai.GenerativeModel('gemini-1.5-flash')

    system_prompt = """You are a business intelligence extraction system.
    Analyze the provided text and return ONLY a valid JSON object with
    no additional text, markdown or explanation.

    Return exactly this structure:
    {
        "summary": "Two sentence executive summary of the key information.",
        "entities": {
            "companies": ["company1", "company2"],
            "people": ["person1", "person2"],
            "places": ["place1", "place2"]
        },
        "metrics": ["metric 1 with value", "metric 2 with value"],
        "sentiment": {
            "label": "Positive",
            "confidence": "High",
            "reasoning": "One sentence explanation"
        },
        "topics": ["topic1", "topic2", "topic3"]
    }

    Rules:
    - summary must be exactly 2 sentences
    - entities lists can be empty if none found
    - metrics should include the actual numbers mentioned
    - sentiment label must be exactly: Positive, Neutral, or Negative
    - confidence must be exactly: High, Medium, or Low
    - topics maximum 5 items
    - Return ONLY the JSON object"""

    response = model.generate_content(
        f"{system_prompt}\n\nText to analyze:\n{text}"
    )

    raw = response.text.strip()
    # Clean any markdown code blocks if present
    raw = re.sub(r'```json\n?', '', raw)
    raw = re.sub(r'```\n?', '', raw)

    return json.loads(raw)
