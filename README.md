![Python](https://img.shields.io/badge/Python-3.11-blue)
![CI](https://github.com/KingGio0326/CreativityLand/actions/workflows/test.yml/badge.svg)
![License](https://img.shields.io/badge/License-MIT-green)

# TradingBot — AI-Powered News Sentiment Trading System

> Scrapes financial news, analyzes sentiment with FinBERT,
> generates BUY/SELL/HOLD signals using semantic search and
> a multi-agent LangGraph system.

## Architecture

```
                        ┌──────────────────────────────────────┐
                        │           GitHub Actions             │
                        │  ┌──────┐ ┌──────┐ ┌──────────────┐ │
                        │  │ Test │ │Deploy│ │ Bot (cron 6h)│ │
                        │  └──┬───┘ └──┬───┘ └──────┬───────┘ │
                        └─────┼────────┼────────────┼──────────┘
                              │        │            │
          ┌───────────────────┼────────┼────────────┼──────────┐
          │                   │        │            │          │
  ┌───────▼───────┐   ┌──────▼─────┐  │   ┌────────▼────────┐ │
  │   Scraper     │   │  Dashboard │  │   │  Signal Engine  │ │
  │               │   │  (Next.js) │  │   │                 │ │
  │ • NewsAPI     │   │            │  │   │ • Weighted      │ │
  │ • Google RSS  │   │ • Signals  │  │   │   sentiment     │ │
  │ • SeekingAlpha│   │ • Articles │  │   │ • Exponential   │ │
  │ • MarketWatch │   │ • Backtest │  │   │   decay         │ │
  │ • Yahoo RSS   │   │ • Search   │  │   │ • BUY/SELL/HOLD │ │
  └───────┬───────┘   └──────┬─────┘  │   └────────┬────────┘ │
          │                  │        │            │          │
          │           ┌──────▼─────┐  │   ┌────────▼────────┐ │
          │           │  Vercel    │  │   │   Backtester    │ │
          │           │  (deploy)  │  │   │  (backtrader)   │ │
          │           └────────────┘  │   └────────┬────────┘ │
          │                           │            │          │
  ┌───────▼───────┐           ┌───────▼────────────▼────────┐ │
  │   NLP Module  │           │        Supabase (Postgres)  │ │
  │               │           │                             │ │
  │ • FinBERT     │──────────▶│ • articles (+ pgvector)     │ │
  │   sentiment   │           │ • signals                   │ │
  │ • MiniLM-L6   │           │ • backtest_results          │ │
  │   embeddings  │           │ • match_articles() RPC      │ │
  └───────────────┘           └─────────────────────────────┘ │
          └────────────────────────────────────────────────────┘
```

## Agent System

The bot uses a **multi-agent LangGraph pipeline** with weighted voting:

```
scraper -> social -> sentiment -> research -> fundamental -> technical
-> momentum -> mean_reversion -> ml -> risk -> macro -> weighted -> critic
```

| Agent | Data Source | Signal | Weight |
|---|---|---|---|
| SentimentAgent | FinBERT + news articles | BUY/SELL/HOLD | 22% |
| SocialAgent | Reddit/WSB keyword sentiment | BUY/SELL/HOLD | 8% |
| FundamentalAgent | yfinance P/E, ROE, PEG, growth | BUY/SELL/HOLD | 18% |
| TechnicalAgent | RSI, MACD, Bollinger Bands, SMA | BUY/SELL/HOLD | 15% |
| MomentumAgent | Multi-timeframe returns, RS vs SPY | BUY/SELL/HOLD | 12% |
| MeanReversionAgent | Z-score, Bollinger %B, half-life | BUY/SELL/HOLD | 6% |
| MLPredictionAgent | XGBoost 5-day price prediction | BUY/SELL/HOLD | 11% |
| MacroAgent | Claude Haiku causal analysis | BUY/SELL/HOLD | 8% |
| RiskAgent | Volatility, VaR, drawdown | Risk level | - |
| ResearchAgent | pgvector semantic search history | Context | - |
| CriticAgent | Confidence/quality validation | Approve/Retry | - |

**WeightedVote** aggregates all signals with confidence-weighted voting.
Consensus levels: **strong** (>=70% agree), **moderate** (>=50%), **weak** (<50% -> forced HOLD).

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.11 |
| Sentiment Analysis | ProsusAI/FinBERT (HuggingFace) |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 (384d) |
| Vector Search | pgvector (cosine similarity) |
| Database | Supabase (PostgreSQL) |
| Backtesting | backtrader + yfinance |
| Dashboard | Next.js 16 + TypeScript + Tailwind + shadcn/ui |
| Charts | Recharts |
| CI/CD | GitHub Actions |
| Hosting | Vercel |

## Quick Start

```bash
git clone https://github.com/KingGio0326/CreativityLand.git
cd CreativityLand
cp .env.example .env  # fill in your API keys
pip install -r requirements.txt
python -m scraper.news_scraper  # first test run
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase service_role key |
| `NEWS_API_KEY` | NewsAPI.org API key |
| `ALPACA_API_KEY` | Alpaca trading API key |
| `ALPACA_SECRET_KEY` | Alpaca trading secret |

## GitHub Secrets

Required for CI/CD (Settings > Secrets > Actions):

| Secret | Source |
|--------|--------|
| `SUPABASE_URL` | Supabase > Project Settings > API > URL |
| `SUPABASE_KEY` | Supabase > Project Settings > API > service_role |
| `SUPABASE_ANON_KEY` | Supabase > Project Settings > API > anon public |
| `NEWS_API_KEY` | newsapi.org > Account |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys |
| `VERCEL_TOKEN` | vercel.com > Settings > Tokens |
| `VERCEL_ORG_ID` | vercel.com > Settings > General |
| `VERCEL_PROJECT_ID` | Vercel project settings |

## CI/CD Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `test.yml` | Push/PR to main | Lint (flake8), pytest, Next.js build |
| `deploy.yml` | Push to main (dashboard/**) | Deploy dashboard to Vercel |
| `bot.yml` | Cron every 6h / manual | Scrape → NLP → Multi-agent analysis → Signals |

## Tests

```bash
pytest tests/ -v
flake8 scraper/ nlp/ engine/ --max-line-length=100 --ignore=E501,W503
```

## Project Structure

```
├── agents/           # Multi-agent LangGraph system (11 agents)
├── scraper/          # News scraping (NewsAPI, RSS feeds)
├── nlp/              # Sentiment (FinBERT) + Embeddings (MiniLM)
├── engine/           # Signal generation + Backtesting
├── models/           # Trained ML models (.pkl)
├── dashboard/        # Next.js frontend
├── supabase/         # Database migrations
├── tests/            # pytest test suite
├── .github/          # CI/CD workflows + dependabot
├── requirements.txt
└── .env.example
```

## License

MIT — see [LICENSE](LICENSE).

---

> **Disclaimer:** This is an educational project. It does not constitute
> financial advice. Use at your own risk.
