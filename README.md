# Trading Bot

AI-powered trading bot that scrapes financial news, analyzes sentiment via NLP, and generates trading signals.

## Architecture

- **scraper/** – News scraping from RSS feeds and web sources
- **nlp/** – Sentiment analysis and text embeddings
- **engine/** – Signal generation and backtesting
- **dashboard/** – Next.js frontend for monitoring
- **supabase/** – Database migrations

## Setup

```bash
# Python environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Dashboard
cd dashboard
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your API keys.

## Tests

```bash
pytest tests/
```
