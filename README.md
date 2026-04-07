# CreativityLand Trading Bot

An autonomous AI trading system built on a multi-agent LangGraph pipeline. 19 specialized agents analyze news, sentiment, fundamentals, technicals, and macro data every 2 hours to generate BUY/SELL signals — then execute them automatically on Alpaca (paper trading, $1k virtual budget).

**Live dashboard:** [creativity-land.vercel.app](https://creativity-land.vercel.app)

---

## Architecture

### Multi-Agent Pipeline (22 LangGraph nodes)

```
regime → scraper → social → sentiment → research → fundamental → technical → options
→ momentum → mean_reversion → ml → risk → liquidity → macro → intermarket
→ seasonal → institutional → weighted → meta_labeling → critic → exit_strategy
```

Each agent casts a weighted vote (BUY / SELL / HOLD). The **WeightedSignalAgent** combines votes with regime-adjusted weights into a final signal. **CriticAgent** validates quality and can trigger a retry.

### Key Components

| Component | File | Description |
|-----------|------|-------------|
| Orchestrator | `agents/orchestrator.py` | LangGraph StateGraph, `decide(ticker)` entry point |
| Regime Detector | `engine/regime_detector.py` | VIX + SPY + TLT → bull/bear/neutral/crisis (cached 6h) |
| Exit Strategy | `agents/exit_strategy_agent.py` | ATR-14 based SL/TP/trailing stop, regime-adjusted |
| Trade Executor | `engine/executor.py` | BUY/SELL execution with 9 pre-flight safety checks |
| Alpaca Broker | `engine/broker_alpaca.py` | REST adapter (paper/live), bracket orders, fractional support |
| Ratchet Manager | `engine/ratchet_manager.py` | Dynamic SL/TP ratcheting, long + short, bidirectional |
| Scoring Engine | `engine/scoring_engine.py` | Signal evaluation at 6h/24h/72h/168h horizons |
| Meta-Labeling | `agents/meta_labeling_agent.py` | XGBoost confidence calibration (Lopez de Prado AFML) |

### AFML Implementations (Lopez de Prado)

- **Triple Barrier Labeling** (`engine/triple_barrier.py`) — ATR-based barriers per regime for ML training labels
- **Fractional Differentiation** (`engine/fractional_diff.py`) — FFD features preserving memory while achieving stationarity
- **Purged K-Fold CV** (`engine/purged_kfold.py`) — eliminates leakage in time-series cross-validation
- **Meta-Labeling** (`agents/meta_labeling_agent.py`) — separates direction (side) from quality (size)

### Short Selling

SELL signals without an open long position open a short. Guards:
- Crypto blocked (not supported on Alpaca paper)
- `MIN_SHORT_CONFIDENCE = 0.60` (vs 0.55 for longs)
- Earnings protection: blocked within 7 days of earnings (yfinance calendar)
- Integer shares only (Alpaca bracket order requirement)
- SL/TP direction enforced: `TP < entry < SL`

### Ratcheting Take Profit

When price reaches 80% of the entry→TP distance with momentum, the old TP becomes the new SL (profit locked) and a new TP is set at `old_TP + ATR × regime_mult`. Supports both long and short positions. PATCH order: TP first (safe), then SL (risky). Verified post-PATCH.

---

## Stack

**Backend:** Python 3.11 · LangGraph · Supabase (PostgreSQL + pgvector) · FinBERT · XGBoost · yfinance · OpenRouter (Gemini Flash 2.0)

**Frontend:** Next.js 16 App Router · Recharts · Tailwind CSS · Supabase JS

**Infra:** GitHub Actions · Vercel · Alpaca · Telegram Bot API

---

## Tickers Monitored (43)

**Stocks:** AAPL TSLA NVDA MSFT AMZN GOOG META AMD INTC AVGO TSM MU JPM GS BAC V MA XOM CVX COP OXY LMT RTX NOC JNJ PFE LLY WMT COST DIS

**ETF:** SPY QQQ GLD SLV XLE XLF USO TLT

**Crypto:** BTC-USD ETH-USD SOL-USD XRP-USD DOGE-USD

---

## Automation

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `bot.yml` | Every 2h | Scrape → sentiment → embeddings → agents → execute → score → notify |
| `bot.yml` (Sunday) | 02:00 UTC | + retrain ML + weekly report + build patterns |
| `position_manager.yml` | Every 1h at :30 | Ratchet check → trailing stop → orphan detection |
| `test.yml` | On push/PR | Python lint + tests + dashboard build |
| `deploy.yml` | On dashboard changes | Deploy to Vercel |

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| `/portfolio` | Live Alpaca positions, equity curve, trade history |
| `/performance` | Signal stats at 4 horizons (6h / 24h / 72h / 168h) |
| `/patterns` | Candlestick charts with historical pattern overlay + hit rate |
| `/agents` | Per-agent vote breakdown with reasoning |
| `/guide` | Agent cards with descriptions and animations |
| `/correlation` | Cross-asset correlation matrix |
| `/finbert` | FinBERT sentiment browser |
| `/articles` | Article browser with sentiment labels |

---

## Safety Checks

Before any trade executes, 9 pre-flight checks run:

1. Position already open for ticker
2. Confidence below threshold (55% long / 60% short)
3. Consensus too weak
4. Max 10 open positions reached
5. Daily loss > 5% — circuit breaker
6. Order cooldown (same ticker within 6h)
7. Market closed (US stocks only; crypto 24/7)
8. Price moved > 5% since signal (stale)
9. Equity dropped > 15% from peak — emergency close all

---

## Setup

```bash
git clone https://github.com/KingGio0326/CreativityLand.git
cd CreativityLand
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in the keys below.

### Environment Variables

```env
SUPABASE_URL=
SUPABASE_KEY=            # service_role key
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
OPENROUTER_API_KEY=      # Gemini Flash 2.0 + Llama 3.3 70B fallback
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=       # comma-separated chat IDs
TRADING_ENABLED=false    # set true to enable live execution
PAPER_TRADING=true
NEWS_API_KEY=
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

### Run

```bash
# Test a single signal
python -c "from agents.orchestrator import TradingOrchestrator; print(TradingOrchestrator().decide('AAPL'))"

# Run tests
pytest tests/ -v --cov=. --cov-fail-under=25

# Start Telegram bot
python -m bot_telegram.telegram_bot

# Dashboard (dev)
cd dashboard && npm install && npm run dev
```

---

## Costs

| Service | Cost |
|---------|------|
| Supabase (free tier) | $0/mo |
| GitHub Actions (public repo) | $0/mo |
| Vercel (free tier) | $0/mo |
| Alpaca Paper Trading | $0/mo |
| OpenRouter (free credits) | $0/mo |
| **Total** | **$0/mo** |

---

**Strategia broker e roadmap di espansione mercati:** [`docs/BROKER_EXPANSION_STRATEGY.md`](docs/BROKER_EXPANSION_STRATEGY.md)

---

*~25,800 lines of code · 185 commits · 157 files*
