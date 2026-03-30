# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Python Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v --cov=. --cov-report=xml --cov-fail-under=25

# Lint
flake8 scraper/ nlp/ engine/ --max-line-length=120

# Run full pipeline for a ticker (requires all env vars)
python -c "from agents.orchestrator import TradingOrchestrator; bot = TradingOrchestrator(); print(bot.decide('AAPL'))"

# Evaluate pending signals
python -c "from engine.scoring_engine import ScoringEngine; se = ScoringEngine(); se.evaluate_pending(); se.update_agent_performance()"

# Test LLM client (OpenRouter)
python engine/llm_client.py

# Start Telegram bot (polling mode)
python -m bot_telegram.telegram_bot
```

### Dashboard (Next.js)
```bash
cd dashboard
npm install
npm run dev      # Dev server on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

## Architecture

### Multi-Agent Trading Pipeline

18 agents run sequentially via LangGraph (`agents/orchestrator.py`), sharing a `TradingState` TypedDict (`agents/__init__.py`) with ~30 fields:

```
regime → scraper → social → sentiment → research → fundamental → technical → options
→ momentum → mean_reversion → ml → risk → liquidity → macro → intermarket
→ seasonal → institutional → weighted → critic (conditional retry)
```

**RegimeDetector** (`engine/regime_detector.py`) classifies market as bull/bear/neutral/crisis using VIX, SPY 30d trend + SMA50/200, TLT flight-to-safety. Cached 6h in Supabase `market_regime` table.

**WeightedSignalAgent** combines votes with regime-adjusted weights. Base weights: sentiment (22%), fundamental (18%), momentum (12%), technical (11%), ml_prediction (11%), etc. Regime modifiers shift weights (e.g., bear: sentiment 1.3x, macro 1.5x, momentum 0.7x). Consensus levels: strong >=70%, moderate >=50%, weak <50% forces HOLD.

**CriticAgent** validates quality and can trigger retry.

### Data Flow

1. **Scraping** (`scraper/news_scraper.py`): NewsAPI, Finnhub, Alpha Vantage, RSS feeds → `articles` table
2. **NLP** (`nlp/sentiment.py`, `nlp/embeddings.py`): FinBERT sentiment + MiniLM 384-dim embeddings → pgvector
3. **Agents** process articles + market data → weighted vote → BUY/SELL/HOLD signal
4. **Scoring** (`engine/scoring_engine.py`): Evaluates signals at 6h/24h/72h/168h horizons. HOLD signals are excluded from performance stats (score=0, filtered in API).
5. **Patterns** (`engine/pattern_matcher.py`): pgvector cosine similarity on historical price patterns

### LLM Integration

All LLM calls go through `engine/llm_client.py` via OpenRouter. Default model: `google/gemini-2.0-flash-001`, fallback: `meta-llama/llama-3.3-70b-instruct`. Used by `agents/macro_agent.py` and `agents/research_agent.py`.

### Dashboard

Next.js 16 App Router at `dashboard/`. API routes in `dashboard/src/app/api/`. Key pages: `/performance` (multi-horizon stats with StatCard explanations), `/patterns` (candlestick charts with historical overlay), `/guide` (agent cards with animations), `/agents`, `/correlation`.

Supabase client initialized in `dashboard/src/lib/supabase.ts`.

### Telegram Bot

`bot_telegram/telegram_bot.py`: Inline keyboard navigation (no typing). `bot_telegram/telegram_notifier.py`: Push notifications to multiple chat IDs via `TELEGRAM_CHAT_IDS` env var. Supabase client is lazy-initialized via `get_supabase()` to avoid import-time errors.

### CI/CD

- `bot.yml`: Runs every 6h. Scrape → sentiment → embeddings → agents → scoring → telegram notify. Sunday: retrain ML + weekly report + build patterns.
- `test.yml`: On push/PR. Python lint+tests, dashboard build.
- `deploy.yml`: Dashboard to Vercel on changes to `dashboard/`.

## Key Conventions

- Python return values in `signal_evaluations` are stored as percentages (e.g., -2.58 means -2.58%). Do not multiply by 100 again in the API.
- Tickers tracked: 43 ticker tra azioni USA (tech, finance, energy, defense, pharma, consumer), ETF (SPY, QQQ, GLD, SLV, XLE, XLF, USO, TLT) e crypto (BTC-USD, ETH-USD, SOL-USD, XRP-USD, DOGE-USD). Lista completa in `bot_telegram/telegram_bot.py` TICKERS.
- UI uses dark crypto theme with purple accent (#7c3aed, #a855f7), Barlow Condensed font for labels.
- `.env` must be loaded before Supabase client creation (use `load_dotenv()` at top of entry points).
- The `.env` file is gitignored. All secrets are in GitHub Actions secrets.
