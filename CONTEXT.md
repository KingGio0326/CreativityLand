# CONTEXT.md

Documento di continuità per riprendere lo sviluppo del progetto **CreativityLand Trading Bot** in una nuova sessione.
Ultimo aggiornamento: 2026-03-30.

---

## 1. Stack Tecnico

### Backend (Python 3.11)
| Libreria | Versione | Uso |
|----------|----------|-----|
| langgraph | latest | Orchestrazione grafo agenti |
| supabase | >=2.3.0 | Database + pgvector |
| transformers | >=4.36.0 | FinBERT sentiment analysis |
| sentence-transformers | >=2.2.0 | MiniLM embeddings (384-dim) |
| torch | >=2.1.0 | Backend ML |
| xgboost | >=2.0 | ML prediction agent |
| scikit-learn | >=1.4 | Feature engineering |
| yfinance | >=0.2.31 | Prezzi storici |
| ta | >=0.11 | Indicatori tecnici |
| feedparser | >=6.0.0 | RSS parsing |
| trafilatura | >=1.9 | Full-text extraction |
| finnhub-python | >=2.4 | News API Finnhub |
| httpx | >=0.25.0 | HTTP async client |
| openai | >=1.0.0 | Client OpenRouter (compatibile OpenAI) |
| python-telegram-bot | >=21.0 | Bot Telegram (v22.7 installata) |
| praw | >=7.7 | Reddit scraping |
| dtaidistance | >=2.3.10 | DTW per pattern matching |
| googlenewsdecoder | >=0.1.7 | Decode Google News URLs |

### Frontend (Next.js 16)
| Libreria | Versione | Uso |
|----------|----------|-----|
| next | 16.1.6 | Framework React |
| react | 19.2.3 | UI library |
| recharts | ^3.8.0 | Grafici |
| @supabase/supabase-js | ^2.99.1 | Client Supabase |
| tailwindcss | ^4 | Styling |
| shadcn/ui | ^4.0.8 | Componenti UI |
| lucide-react | ^0.577.0 | Icone |

### Infrastruttura
- **Database**: Supabase PostgreSQL con pgvector
- **Hosting dashboard**: Vercel
- **CI/CD**: GitHub Actions
- **LLM**: OpenRouter (Gemini Flash 2.0 + Llama 3.3 70B fallback)
- **Bot**: Telegram Bot API (polling mode)

---

## 2. Struttura File Principali

```
progetto_stef/
├── agents/                        # 19 agenti trading
│   ├── __init__.py                # TradingState TypedDict (34 campi)
│   ├── orchestrator.py            # LangGraph StateGraph + TradingOrchestrator
│   ├── weighted_signal_agent.py   # Voto pesato + pattern/research modifiers
│   ├── meta_labeling_agent.py     # Meta-model XGBoost per calibrazione confidence
│   ├── critic_agent.py            # Validazione qualità, retry condizionale
│   ├── exit_strategy_agent.py     # SL/TP/trailing stop basati su ATR-14
│   ├── scraper_agent.py           # Carica articoli da Supabase
│   ├── sentiment_agent.py         # Aggregazione sentiment FinBERT
│   ├── social_sentiment_agent.py  # Reddit + social media
│   ├── research_agent.py          # arXiv papers via LLM
│   ├── fundamental_agent.py       # Metriche fondamentali
│   ├── technical_agent.py         # Indicatori tecnici (RSI, MACD, BB)
│   ├── momentum_agent.py          # Momentum strategy
│   ├── mean_reversion_agent.py    # Mean reversion (z-score)
│   ├── ml_prediction_agent.py     # XGBoost prediction + walk-forward
│   ├── risk_agent.py              # VaR, drawdown, volatilità
│   ├── options_agent.py           # Put/call ratio, implied vol
│   ├── liquidity_agent.py         # Volume analysis
│   ├── macro_agent.py             # Geopolitica + macro via LLM
│   ├── intermarket_agent.py       # Correlazioni cross-asset
│   ├── seasonal_agent.py          # Effetti stagionali
│   └── institutional_agent.py     # Flussi istituzionali
│
├── engine/
│   ├── llm_client.py              # Client OpenRouter unificato
│   ├── regime_detector.py         # RegimeDetector: VIX/SPY/TLT → bull/bear/neutral/crisis
│   ├── scoring_engine.py          # Valutazione segnali + pattern performance
│   ├── signals.py                 # Salvataggio segnali su Supabase
│   ├── pattern_matcher.py         # pgvector cosine similarity
│   ├── pattern_extractor.py       # Estrazione pattern storici
│   ├── correlation_engine.py      # Matrice correlazione ticker
│   ├── executor.py                # TradeExecutor: esecuzione ordini + safety checks
│   ├── broker_alpaca.py           # Alpaca REST adapter (paper/live)
│   ├── triple_barrier.py          # TripleBarrierLabeler (López de Prado AFML cap.3)
│   ├── fractional_diff.py         # FFD: Fractional Differentiation (López de Prado AFML cap.5)
│   ├── purged_kfold.py            # PurgedKFoldCV: Purged K-Fold CV (López de Prado AFML cap.7)
│   └── arxiv_search.py            # Ricerca paper arXiv
│
├── scraper/
│   └── news_scraper.py            # Multi-source RSS + API scraper
│
├── nlp/
│   ├── sentiment.py               # SentimentAnalyzer (FinBERT)
│   └── embeddings.py              # EmbeddingEngine (MiniLM 384-dim)
│
├── bot_telegram/
│   ├── telegram_bot.py            # Bot inline keyboard (polling)
│   └── telegram_notifier.py       # Push notifications multi-user
│
├── dashboard/                     # Next.js 16 App Router
│   └── src/
│       ├── app/
│       │   ├── page.tsx           # Homepage dashboard
│       │   ├── agents/page.tsx    # Vista agenti
│       │   ├── performance/page.tsx # Stats multi-orizzonte + StatCard
│       │   ├── patterns/page.tsx  # Candlestick + overlay storici
│       │   ├── correlation/page.tsx # Matrice correlazione
│       │   ├── guide/page.tsx     # Guida agenti con animazioni
│       │   ├── articles/page.tsx  # Browser articoli
│       │   ├── finbert/page.tsx   # Analisi FinBERT
│       │   ├── backtest/page.tsx  # Risultati backtest
│       │   ├── search/page.tsx    # Ricerca semantica
│       │   ├── portfolio/page.tsx # Portfolio live (Alpaca) — equity curve, posizioni, trades
│       │   ├── trades/page.tsx    # DEPRECATED: redirect a /portfolio
│       │   └── api/               # API routes
│       │       ├── performance/route.ts
│       │       ├── portfolio/route.ts             # Live Alpaca data (account, positions, history, trades)
│       │       ├── equity-curve/route.ts          # Portfolio simulation (4 orizzonti)
│       │       ├── equity-curve-sltp/route.ts     # DEPRECATED: SL/TP chart rimosso
│       │       ├── trades/route.ts                # DEPRECATED: redirect a /api/portfolio
│       │       └── patterns-performance/route.ts  # Pattern matching stats
│       ├── components/
│       │   ├── FloatingSidebar.tsx # Sidebar navigazione (collapsible)
│       │   ├── AgentCard.tsx      # Card singolo agente
│       │   └── AgentChat.tsx      # Chat con agente
│       └── lib/
│           └── supabase.ts        # Client Supabase
│
├── .github/workflows/
│   ├── bot.yml                    # Pipeline principale (ogni 6h)
│   ├── test.yml                   # CI: lint + test
│   └── deploy.yml                 # Deploy dashboard su Vercel
│
├── CLAUDE.md                      # Istruzioni per Claude Code
├── CONTEXT.md                     # Questo file
├── requirements.txt               # Dipendenze Python
└── .env                           # Variabili d'ambiente (gitignored)
```

---

## 3. Agenti e Pesi

### Pipeline LangGraph (ordine di esecuzione — 22 nodi)

```
regime → scraper → social → sentiment → research → fundamental → technical → options
→ momentum → mean_reversion → ml → risk → liquidity → macro → intermarket
→ seasonal → institutional → weighted → meta_labeling → critic (conditional retry) → exit_strategy
```

`regime` è il primo nodo: classifica il mercato come bull/bear/neutral/crisis usando VIX, SPY 30d trend + SMA50/200, TLT flight-to-safety. Il risultato viene propagato nel `TradingState` e usato dal `WeightedSignalAgent` per aggiustare i pesi.

`exit_strategy` è l'ultimo nodo: per ogni segnale BUY/SELL calcola stop loss, take profit e trailing stop basati su ATR-14. I livelli vengono regolati per regime di mercato (multiplier: crisis 3.0x, bear 2.5x, neutral 2.0x, bull 1.5x) e per confidence (alta confidence → stop più stretti). Il risk-reward ratio varia tra 2.0 e 3.0 in base alla confidence. Il trailing stop si attiva al 50% del TP distance e porta lo stop a break-even. Per crypto usa dati orari (ATR più reattivo), per azioni dati giornalieri.

### Pesi nel WeightedSignalAgent

```python
WEIGHTS = {
    "sentiment":      0.22,   # FinBERT aggregate
    "fundamental":    0.18,   # P/E, revenue growth, margins
    "momentum":       0.12,   # Price momentum strategy
    "technical":      0.11,   # RSI, MACD, Bollinger Bands
    "ml_prediction":  0.11,   # XGBoost classifier
    "liquidity":      0.08,   # Volume analysis
    "options":        0.06,   # Put/call ratio, IV
    "macro":          0.04,   # Geopolitica + macro (LLM)
    "intermarket":    0.04,   # Cross-asset correlations
    "seasonal":       0.04,   # Effetti calendario
    "institutional":  0.04,   # Flussi istituzionali
    "mean_reversion": 0.02,   # Z-score mean reversion
}
# Totale: 1.06 (normalizzato a runtime da total_weight)
```

### Logica di voto
- `final_score > 0.15` → BUY
- `final_score < -0.15` → SELL
- Altrimenti → HOLD
- Consensus: strong ≥70%, moderate ≥50%, weak <50% → forza HOLD
- Modificatori post-voto: pattern matching (±15%), research context (±5%)

### Modificatori pesi per regime
I pesi base degli agenti vengono moltiplicati per fattori regime-specifici prima del voto:

| Regime | Modificatori |
|--------|-------------|
| **crisis** | sentiment 1.5x, macro 2.0x, mean_reversion 2.0x, momentum 0.5x |
| **bear** | sentiment 1.3x, macro 1.5x, mean_reversion 1.5x, momentum 0.7x |
| **bull** | momentum 1.3x, ml_prediction 1.2x, fundamental 1.2x |
| **neutral** | nessun modificatore (pesi base) |

---

## 4. Schema Supabase

### `articles`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| title | text | |
| content | text | Full-text estratto |
| url | text | UNIQUE, usato per dedup |
| source | text | Nome fonte (CNBC, Motley Fool, etc.) |
| ticker | text | Ticker associato |
| published_at | timestamptz | Data pubblicazione |
| scraped_at | timestamptz | Default now() |
| embedding | vector(384) | MiniLM embedding (pgvector) |
| sentiment_label | text | positive/negative/neutral |
| sentiment_score | float8 | -1.0 a 1.0 |
| processed | boolean | Flag per NLP processing |
| geo_relevance | text | high/medium/low/none |
| geo_weight | float8 | 2.0/1.5/1.2/1.0 |

### `signals`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| ticker | text | |
| signal | text | BUY/SELL/HOLD |
| confidence | float8 | 0.0-1.0 |
| reasoning | text | JSON array stringificato |
| articles_used | text[] | Array URL articoli |
| created_at | timestamptz | |
| kelly_fraction | float8 | Kelly criterion fraction |
| position_size_pct | float8 | % del portafoglio da allocare |
| max_position_usd | float8 | Max capitale suggerito |
| consensus_level | text | strong/moderate/weak |
| agents_agree | int | Agenti concordi |
| agents_total | int | Agenti totali |
| dominant_factor | text | Fattore dominante nel voto |
| market_regime | text | Regime al momento del segnale |
| vote_breakdown | jsonb | Dettaglio voti per agente |
| stop_loss | float8 | Prezzo stop loss (ExitStrategyAgent) |
| take_profit | float8 | Prezzo take profit |
| sl_percentage | float8 | % distanza SL da entry |
| tp_percentage | float8 | % distanza TP da entry |
| risk_reward_ratio | float8 | Rapporto R:R (2.0-3.0) |
| atr_14 | float8 | ATR-14 al momento del segnale |
| trailing_activation | float8 | Prezzo attivazione trailing stop |
| trailing_level | float8 | Livello trailing (break-even) |

### `signal_evaluations`
| Colonna | Tipo | Note |
|---------|------|------|
| id | bigint | PK |
| signal_id | text | FK → signals.id |
| ticker | text | |
| signal_type | text | BUY/SELL/HOLD |
| confidence | float8 | |
| entry_price | float8 | Prezzo alla data del segnale |
| entry_date | timestamptz | |
| price_6h/24h/72h/168h | float8 | Prezzi ai vari orizzonti |
| return_6h/24h/72h/168h | float8 | % return (già in percentuale!) |
| score_6h/24h/72h/168h | float8 | Score calcolato |
| agent_scores | jsonb | Score per agente |
| fully_evaluated | boolean | true quando tutti gli orizzonti sono compilati |
| evaluated_at | timestamptz | |
| barrier_label | integer | Triple Barrier: 1=TP hit, -1=SL hit, 0=neutro |
| barrier_hit | text | Quale barriera toccata: upper, lower, vertical |
| barrier_hit_hours | float8 | Ore dall'entry al barrier hit |
| max_favorable_pct | float8 | Max Favorable Excursion (MFE) in % |
| max_adverse_pct | float8 | Max Adverse Excursion (MAE) in % |

### `agent_performance`
| Colonna | Tipo | Note |
|---------|------|------|
| id | bigint | PK |
| agent_name | text | Sempre "pipeline" |
| ticker | text | |
| date | date | |
| signals_total | int | Solo BUY/SELL (HOLD esclusi) |
| signals_correct | int | Score > 0 |
| hit_rate | float8 | correct/total |
| avg_score | float8 | |
| cumulative_score | float8 | |
| spy_return_same_period | float8 | Benchmark |
| alpha | float8 | |

### `price_patterns`
| Colonna | Tipo | Note |
|---------|------|------|
| id | bigint | PK |
| ticker | text | |
| start_date / end_date | date | Finestra pattern |
| pattern_vector | vector | pgvector per cosine similarity |
| outcome_5d/10d/20d | float8 | % return dopo pattern |
| market_regime | text | bull/bear/neutral |
| month, quarter | float8 | Stagionalità |
| rate_direction | text | up/down/flat |
| is_crisis | boolean | |

### `market_regime`
| Colonna | Tipo | Note |
|---------|------|------|
| id | bigint | PK |
| regime | text | bull/bear/neutral/crisis |
| confidence | float8 | 0.0-1.0 |
| vix_level | float8 | Valore VIX corrente |
| spy_trend_30d | float8 | % variazione SPY 30gg |
| tlt_trend_30d | float8 | % variazione TLT 30gg (flight-to-safety) |
| spy_sma50 | float8 | SPY SMA 50 giorni |
| spy_sma200 | float8 | SPY SMA 200 giorni |
| detected_at | timestamptz | Cache 6h — viene ricalcolato se > 6h |

### `pattern_evaluations`
| Colonna | Tipo | Note |
|---------|------|------|
| id | bigint | PK |
| signal_id | uuid | FK → signals.id |
| ticker | text | |
| signal_date | timestamptz | Data del segnale |
| pattern_prediction | text | bullish/bearish/neutral |
| pattern_boost | float8 | +0.15, -0.15, o 0.0 |
| patterns_matched | int | Quanti pattern trovati |
| best_similarity | float8 | Miglior cosine similarity |
| regime_at_signal | text | Regime di mercato al momento |
| regime_filtered | boolean | Se il filtro regime era attivo |
| actual_return_168h | float8 | Return reale a 7 giorni (compilato dopo) |
| pattern_correct | boolean | Se la predizione era corretta |
| evaluated | boolean | Default false, true dopo 168h |

### `correlation_cache`
| Colonna | Tipo |
|---------|------|
| id | bigint |
| matrix | jsonb |
| high_correlations | jsonb |
| low_correlations | jsonb |
| computed_at | timestamptz |

### `backtest_results`
| Colonna | Tipo |
|---------|------|
| id | uuid |
| ticker | text |
| start_date / end_date | date |
| total_return | float8 |
| sharpe_ratio | float8 |
| max_drawdown | float8 |
| win_rate | float8 |
| trades_count | int |

### `ml_validation`
| Colonna | Tipo |
|---------|------|
| id | bigint |
| ticker | text |
| avg_accuracy / std_accuracy | float8 |
| fold_accuracies | jsonb |
| is_reliable | boolean |
| cv_method | text | 'purged_kfold' (default) |
| embargo_pct | float8 | Percentuale embargo usata |
| n_purged | integer | Sample rimossi dal purging (media fold) |

### `ml_feature_params`
| Colonna | Tipo | Note |
|---------|------|------|
| id | serial | PK |
| ticker | text | |
| feature_name | text | close/high/low/volume |
| optimal_d | float8 | d ottimale FFD (0.0-1.0) |
| adf_pvalue | float8 | p-value ADF test |
| computed_at | timestamptz | Default now() |
| | | UNIQUE(ticker, feature_name) |

### `ml_models`
| Colonna | Tipo | Note |
|---------|------|------|
| id | serial | PK |
| model_name | text | UNIQUE (es. 'meta_labeling_global') |
| model_data | jsonb | XGBoost model serializzato in JSON |
| feature_names | text[] | Nomi features usate dal modello |
| metrics | jsonb | accuracy, precision, recall, n_samples |
| trained_at | timestamptz | Default now() |
| n_samples | integer | Campioni usati per training |

### `positions`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| ticker | text | |
| side | text | long/short |
| qty | float8 | Numero azioni/unità |
| entry_price | float8 | Prezzo medio di ingresso |
| current_price | float8 | Ultimo prezzo noto |
| market_value | float8 | qty × current_price |
| unrealized_pl | float8 | P&L non realizzato |
| signal_id | uuid | FK → signals.id |
| opened_at | timestamptz | |
| status | text | open/closed |

### `trades`
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid | PK |
| position_id | uuid | FK → positions.id |
| ticker | text | |
| side | text | buy/sell |
| qty | float8 | |
| price | float8 | Prezzo esecuzione |
| pnl | float8 | P&L realizzato |
| close_reason | text | sl/tp/trailing/manual/time |
| executed_at | timestamptz | |

### `portfolio_peak`
| Colonna | Tipo | Note |
|---------|------|------|
| id | serial | PK |
| peak_equity | numeric(12,2) | Massimo storico equity |
| updated_at | timestamptz | Auto-updated via trigger |

---

## 4b. Execution Engine — Safety Layer

### TradeExecutor (`engine/executor.py`)
Esegue segnali BUY/SELL tramite Alpaca REST. **Trading disabilitato per default** (`TRADING_ENABLED=false`).

### Pre-flight checks (9 controlli)
| # | Check | Soglia | Azione |
|---|-------|--------|--------|
| 1 | Posizione già aperta | - | Skip |
| 2 | Confidence troppo bassa | < 55% | Skip |
| 3 | Consensus troppo debole | weak | Skip (richiede moderate+) |
| 4 | Troppe posizioni aperte | >= 10 | Skip |
| 5 | **Circuit breaker** | daily loss > -5% | Blocca + notifica Telegram |
| 6 | Cooldown | ordine < 6h fa | Skip |
| 7 | Mercato chiuso | US stocks only | Skip (crypto 24/7) |
| 8 | **Price staleness** | prezzo mosso > 5% da entry | Skip |
| 9 | **Max drawdown** | equity -15% da picco | Chiude tutto + notifica Telegram |

### Notifiche Telegram trading
| Evento | Funzione | Messaggio |
|--------|----------|-----------|
| Ordine aperto | `notify_order_opened()` | Ticker, shares, prezzo, SL/TP |
| Posizione chiusa | `notify_order_closed()` | Entry→Exit, P&L, motivo |
| Circuit breaker | `notify_circuit_breaker()` | % perdita, ordini bloccati |
| Emergency close | `notify_emergency_close()` | N posizioni chiuse |
| Max drawdown | `notify_drawdown()` | Equity, picco, % drawdown |

### Comandi Telegram trading
| Comando | Azione |
|---------|--------|
| `/stop_trading` | Kill switch: chiude tutte le posizioni, disabilita trading |
| `/start_trading` | Riabilita trading |
| Bottone "Trading" | Mostra status portafoglio + posizioni aperte |
| Bottone "STOP Trading" | Kill switch inline |

---

## 5. Variabili d'Ambiente

```env
# Supabase
SUPABASE_URL=
SUPABASE_KEY=              # service_role key

# News Sources
NEWS_API_KEY=              # newsapi.org
FINNHUB_API_KEY=           # finnhub.io
ALPHA_VANTAGE_API_KEY=     # alphavantage.co
ALPHA_VANTAGE_KEY=         # duplicato (usato da pattern_extractor)

# LLM
OPENROUTER_API_KEY=        # openrouter.ai (per Gemini Flash + Llama fallback)
ANTHROPIC_API_KEY=         # non usato direttamente, legacy

# Trading Data
ALPACA_API_KEY=            # paper trading
ALPACA_SECRET_KEY=
TRADING_ENABLED=false      # Kill switch globale (default: false)
PAPER_TRADING=true         # true = paper, false = live (default: true)

# Social
REDDIT_CLIENT_ID=          # praw
REDDIT_CLIENT_SECRET=

# Macro
FRED_API_KEY=              # Federal Reserve data

# Telegram
TELEGRAM_BOT_TOKEN=        # Bot token da @BotFather
TELEGRAM_CHAT_IDS=         # Comma-separated: 584291386,543687292
```

---

## 6. GitHub Actions Workflow (`bot.yml`)

### Schedule
```yaml
schedule:
  - cron: "0 */6 * * *"   # Ogni 6 ore (00:00, 06:00, 12:00, 18:00 UTC)
  - cron: "0 2 * * 0"     # Domenica alle 02:00 UTC
```

### Job `run-bot` (ogni 6h)
| Step | Comando | Note |
|------|---------|------|
| 1. Scrape news | `python -m scraper.news_scraper` | Multi-source RSS + API |
| 2. Process Sentiment | `SentimentAnalyzer().process_unanalyzed()` | FinBERT batch |
| 3. Process Embeddings | `EmbeddingEngine().process_unembedded()` | MiniLM 384-dim |
| 4. Run multi-agent | `TradingOrchestrator().decide(ticker)` | 8 ticker × 20 nodi (regime → ... → critic) |
| 4b. Save pattern evals | `save_pattern_evaluation()` | Solo se patterns_matched > 0 |
| 4c. Execute trades | `TradeExecutor().execute_signal()` | Solo se `TRADING_ENABLED=true`. Paper/live via `PAPER_TRADING` |
| 5. Evaluate signals | `ScoringEngine().evaluate_pending()` | 6h/24h/72h/168h |
| 6. Register new signals | Inserisce in `signal_evaluations` | |
| 7. Update performance | `ScoringEngine().update_agent_performance()` | Aggregate stats |
| 7b. Evaluate patterns | `ScoringEngine().evaluate_pattern_performance()` | Pattern evals con 168h+ di età |
| 8. Notify Telegram | `format_run_message()` + `notify()` | Include regime header + modifier note |
| 9. Update correlation | `build_correlation_matrix()` | Cache in Supabase |

### Solo domenica (aggiuntivi)
| Step | Comando |
|------|---------|
| 10. Retrain ML | `MLPredictionAgent().train()` + walk-forward validation |
| 11. Weekly Telegram Report | `format_weekly_report()` + `notify()` |
| 12. Build patterns | `PatternExtractor().build_historical_patterns()` |

### Job `build-patterns` (domenica + workflow_dispatch)
Ricostruisce i pattern storici per tutti i ticker da Alpha Vantage.

### Error handling
Step finale `Notify Telegram Error` con `if: failure()` per notificare errori.

---

## 7. Stato Attuale del Sistema (2026-03-30)

| Metrica | Valore |
|---------|--------|
| Ticker monitorati | 43 (AAPL, TSLA, NVDA, MSFT, AMZN, GOOG, META, AMD, INTC, AVGO, TSM, MU, JPM, GS, BAC, V, MA, XOM, CVX, COP, OXY, LMT, RTX, NOC, JNJ, PFE, LLY, WMT, COST, DIS, GLD, SPY, QQQ, XLE, XLF, SLV, USO, TLT, BTC-USD, ETH-USD, SOL-USD, XRP-USD, DOGE-USD) |

### Fonti Scraper Attive
**Stocks:** CNBC, Motley Fool, AP News (via Google RSS), NewsAPI, Finnhub, Alpha Vantage
**Crypto:** CoinDesk, CoinTelegraph, The Block, Decrypt, BeInCrypto, NewsAPI, Alpha Vantage

### Fonti Rimosse
- Seeking Alpha (403), MarketWatch (401), Benzinga (404 redirect)
- Investopedia (402 paywall), TheStreet (404), Zacks (404)
- Google News diretto (44% articoli vuoti), Reuters (401, contenuto ~137 chars)

---

## 8. Bugs Noti / Fix Pendenti

1. **score_168h sempre 0**: Nessun segnale ha ancora 7 giorni di età. I primi score reali a 168h saranno disponibili dal ~25 marzo 2026. Non è un bug, è il sistema che si sta "scaldando".

2. **CNBC contenuto variabile**: Alcuni articoli CNBC vengono scartati da trafilatura (`discarding data`). Il fallback RSS summary funziona ma il contenuto è più corto.

3. **Encoding cp1252**: Su Windows, print() con emoji Unicode può fallire. I file usano escape sequences (`\U0001f7e2`) per evitare il problema. Se si aggiungono nuovi print con emoji dirette, usare escape sequences.

4. **`total_weight` nei pesi**: La somma dei WEIGHTS è 1.06 (non 1.0). Funziona perché il codice normalizza dividendo per `total_weight`, ma potrebbe confondere chi legge i pesi come percentuali.

---

## 9. Roadmap (Priorità)

1. **Attendere score_168h** (~25 marzo) → verificare che le performance stats e hit rate siano corrette sulla dashboard e nel report settimanale
2. **Score composito unificato** → Gauge/meter in homepage che combina hit rate, avg score, alpha, consensus
3. **Discovery automatico nuovi ticker** → Trending topics dallo scraper → suggerimenti via Telegram
4. **Alpha calculation** → Implementare il calcolo dell'alpha (vs SPY) nella `agent_performance` table
5. **Backtest integration** → La tabella `backtest_results` esiste ma non è popolata dal workflow
6. **Dashboard mobile** → La FloatingSidebar non è ottimizzata per mobile
7. **Rate limiting scraper** → Aggiungere retry con backoff per le fonti che occasionalmente falliscono
8. **Agent-level scoring** → Le colonne `agent_scores` in `signal_evaluations` contengono solo confidence, non score reali per agente

---

## 10. Decisioni Architetturali

### Perché score_168h come orizzonte principale
I segnali di trading hanno bisogno di tempo per materializzarsi. 6h e 24h catturano noise, 72h è intermedio, **168h (7 giorni) è l'orizzonte più affidabile** per valutare se un segnale BUY/SELL era corretto. Il `fully_evaluated` diventa true solo quando tutti e 4 gli orizzonti sono calcolati.

### Perché Regime Detection come primo nodo
Il mercato si comporta in modo fondamentalmente diverso in regimi diversi. Un segnale momentum forte in un bull market è affidabile; lo stesso segnale in un bear market potrebbe essere un dead cat bounce. Il `RegimeDetector` classifica il mercato usando 3 indicatori complementari:
- **VIX** (paura): >35 = crisis, >25 = bear component, <18 = bull component
- **SPY 30d trend + SMA50/200 cross**: trend direzionale e golden/death cross
- **TLT 30d trend**: flight-to-safety — se TLT sale mentre SPY scende → bear/crisis confermato

Il regime viene calcolato **prima** di tutti gli agenti e cached per 6h in Supabase. I pesi del `WeightedSignalAgent` vengono poi moltiplicati per fattori regime-specifici (es. in bear: sentiment 1.3x, macro 1.5x, momentum 0.7x), spostando il sistema verso agenti più difensivi quando il mercato è in stress.

### Perché Pattern Evaluation indipendente
Il pattern matching influenza la confidence finale (±15%), ma la pipeline ne oscura l'effetto individuale. La tabella `pattern_evaluations` traccia separatamente se le predizioni del pattern matching (bullish/bearish) erano corrette dopo 168h, permettendo di validare se il sistema di cosine similarity su pgvector aggiunge valore predittivo reale. I dati sono visibili nella sezione "Pattern Matching Performance" della dashboard `/patterns`.

### Perché OpenRouter invece di Anthropic diretto
OpenRouter permette di usare **qualsiasi modello** (Gemini Flash 2.0, Llama, Claude) con un singolo client OpenAI-compatibile. Il default è `google/gemini-2.0-flash-001` (veloce, economico), con fallback su `meta-llama/llama-3.3-70b-instruct`. Switching model = cambiare una stringa.

### Perché return values in percentuale diretta
I valori `return_6h`, `return_24h`, etc. in `signal_evaluations` sono **già in percentuale** (es. -2.58 = -2.58%). L'API della dashboard NON deve moltiplicare per 100. Questo ha causato un bug di double multiplication che è stato fixato.

### Perché HOLD escluso dalle performance stats
I segnali HOLD sono "non-decisioni" — includerli gonfierebbe artificialmente hit rate e avg score. `calculate_score()` ritorna 0.0 per HOLD, e l'API/UI filtra `signal_type !== "HOLD"`.

### Perché FloatingSidebar collapsible
La dashboard ha 10 pagine. Una sidebar fissa mangerebbe troppo spazio. La **FloatingSidebar** si espande al hover (width 56px → 220px) con icone custom PNG. Tema dark con accento viola (#7c3aed, #a855f7), font Barlow Condensed per label.

### Perché lazy Supabase init nel bot Telegram
`create_client()` a livello di modulo causava crash per incompatibilità httpx/supabase durante l'import. Risolto con pattern `get_supabase()` che inizializza al primo uso.

### Perché SCALE_FACTOR=100 per simulare $1k
Alpaca paper trading ha un balance fisso di $100k che non può essere resettato via API. Per simulare un budget realistico di $1k, tutti i valori monetari vengono divisi per `SCALE_FACTOR=100`:
- **API route** (`/api/portfolio`): equity, cash, buying_power, market_value, unrealized_pl, qty, equity_history
- **Executor** (`engine/executor.py`): position sizing usa `virtual_equity = equity / SCALE_FACTOR`, drawdown check su equity scalata, portfolio summary scalato
- **Percentuali** (P&L %, drawdown %): invarianti alla scala, non richiedono aggiustamento
- **Dashboard** (`/portfolio`): mostra valori già scalati dall'API, reference line a $1,000

Se il balance Alpaca viene resettato manualmente (es. a $10k), il SCALE_FACTOR deve essere aggiornato di conseguenza (es. 10).

### Perché il Portfolio è su pagina dedicata e non in Performance
La pagina `/performance` mostra stats degli agenti e equity curve simulata basata sui segnali storici. La pagina `/portfolio` mostra dati **live** da Alpaca: posizioni reali, equity reale, trade eseguiti. Sono due prospettive diverse: una retrospettiva (performance agenti) e una operativa (stato del portafoglio). La vecchia pagina `/trades` è stata deprecata e redirige a `/portfolio`.

### Perché Alpaca env vars su Vercel
Le variabili `ALPACA_API_KEY` e `ALPACA_SECRET_KEY` devono essere configurate nelle Environment Variables di Vercel per il progetto dashboard, oltre che nei GitHub Actions secrets. Senza queste variabili, l'API `/api/portfolio` restituisce 503.

### Perché inline keyboard nel bot Telegram
Il bot è usato da mobile dove digitare comandi è scomodo. Con **inline keyboard** l'interazione è tutta a bottoni: menu → scegli ticker → vedi dettaglio → torna indietro. Zero typing richiesto.

### Perché detect_ticker() nello scraper
Feed generici (CNBC, Motley Fool, Investopedia) non sono ticker-specific. `detect_ticker()` usa keyword matching (es. "apple", "tim cook", "cupertino" → AAPL) per filtrare solo articoli rilevanti ai ticker monitorati, evitando di salvare articoli irrilevanti.

### Perché Triple Barrier Labeling
Il sistema originale usa soglie fisse (±0.15) per generare segnali, e valuta il risultato solo guardando il return a 168h. Il **Triple Barrier Labeling** (López de Prado, "Advances in Financial Machine Learning", cap. 3) è più sofisticato: definisce 3 barriere per ogni segnale (upper=TP, lower=SL, vertical=tempo) calibrate sulla volatilità (ATR-14) e regime di mercato. La **prima barriera toccata** determina il label reale. Questo produce label di qualità superiore per il training di modelli ML perché incorpora volatilità, regime e time-to-hit. Le colonne `barrier_label`, `barrier_hit`, `barrier_hit_hours`, `max_favorable_pct` (MFE), `max_adverse_pct` (MAE) vengono calcolate automaticamente in `evaluate_pending()` quando un segnale diventa `fully_evaluated`. Il backfill dei segnali storici si fa con `scripts/backfill_triple_barrier.py`.

### Perché Meta-Labeling come nodo separato nel grafo
Il sistema produce una confidence basata sulla media ponderata dei voti agenti, ma questa non è una probabilità calibrata. Il **Meta-Labeling** (López de Prado, AFML cap. 3.6) separa la decisione di direzione (side: BUY/SELL, già fatta dal weighted vote) dalla valutazione di qualità (size: quanto fidarsi). Un meta-model XGBoost addestrato sui risultati storici del triple barrier predice P(segnale corretto), calibrando la confidence. Se il modello dice 73% di probabilità di successo per un segnale con confidence 65%, la `meta_confidence = 0.65 × 0.73 = 0.47`. Questo impatta position sizing, exit levels e soglie del critic. Il nodo è posizionato dopo `weighted` e prima di `critic` nel grafo (22 nodi totali). Graceful degradation: senza modello trainato, `meta_confidence = confidence` (pass-through). Il modello viene ri-trainato ogni domenica e persistito come JSON in Supabase (`ml_models` table).

### Perché Purged K-Fold Cross-Validation nel MLAgent
Il walk-forward validation standard (sklearn `TimeSeriesSplit`) non gestisce il leakage informativo nelle serie finanziarie: se il training set finisce al giorno X e il test inizia al giorno X+1, ma i label del training usano returns fino a X+5 giorni, il modello "vede" informazione dal test set. La **Purged K-Fold CV** (López de Prado, AFML cap. 7) risolve con due meccanismi: **purging** (rimuove dal training i sample il cui eval_time ricade nel test period) e **embargo** (buffer temporale aggiuntivo dopo il test set, default 1%). Il risultato è una stima dell'accuracy più conservativa ma realistica. L'accuracy stimata tipicamente scende rispetto al walk-forward naive — questo è corretto e indica che la stima precedente era ottimisticamente biased. Le metriche `cv_method`, `embargo_pct` e `n_purged` vengono salvate in `ml_validation`.

### Perché Fractional Differentiation (FFD) nel MLAgent
Le serie di prezzi sono non-stazionarie (unit root), il che viola le assunzioni dei modelli ML. La differenziazione intera (returns) rende la serie stazionaria ma **distrugge tutta la memoria** (autocorrelazione). La **Fractional Differentiation** (López de Prado, AFML cap. 5) trova il minimo ordine frazionario `d` (tipicamente 0.3-0.5) che rende la serie stazionaria preservando il massimo di memoria. L'implementazione usa il metodo FFD (Fixed-Width Window) con pesi ricorsivi troncati a threshold=1e-3 (~27 pesi per 504 daily bars). Il `find_optimal_d()` testa d da 0.0 a 1.0 in step di 0.05 e sceglie il minimo d per cui il test ADF ha p-value < 0.05. I valori ottimali di d vengono cachati in Supabase (`ml_feature_params`) durante il retraining domenicale e letti durante i run 6h, evitando il costo computazionale di ricalcolarli ogni volta. Features FFD: `close_ffd`, `high_ffd`, `low_ffd`, `volume_ffd`.

### Perché extract_content_safe() con fallback
Trafilatura fallisce su ~15% delle pagine (paywall, JS rendering, 403). `extract_content_safe()` prova: trafilatura full-text → RSS summary → stringa vuota. Questo garantisce che anche se l'estrazione fallisce, almeno il summary RSS viene conservato.

---

## Come riprendere lo sviluppo

### 1. Setup iniziale
```bash
git clone https://github.com/KingGio0326/CreativityLand.git
cd CreativityLand
pip install -r requirements.txt
```

Crea il file `.env` nella root con tutte le variabili della sezione 5. I valori sono nei GitHub Actions secrets.

### 2. Verificare che il database funzioni
```bash
python -c "
from dotenv import load_dotenv; load_dotenv()
from supabase import create_client
import os
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
print('Articoli:', sb.table('articles').select('id', count='exact').execute().count)
print('Segnali:', sb.table('signals').select('id', count='exact').execute().count)
print('Pattern:', sb.table('price_patterns').select('id', count='exact').execute().count)
"
```

### 3. Avviare il bot Telegram localmente
```bash
python -m bot_telegram.telegram_bot
```
Il bot stampa `Bot Telegram avviato con bottoni inline...` e risponde ai comandi inline.
**IMPORTANTE**: se il bot è già in esecuzione (es. un altro terminale), il nuovo darà errore `Conflict`. Chiudi prima l'altra istanza.

### 4. Testare lo scraper
```bash
python -m scraper.news_scraper
```
Dovrebbe mostrare il summary con articoli trovati/salvati per ogni ticker.

### 5. Testare un singolo segnale
```bash
python -c "
from agents.orchestrator import TradingOrchestrator
bot = TradingOrchestrator()
result = bot.decide('AAPL')
print(f\"Signal: {result['signal']} ({result['confidence']:.0%})\")
print(f\"Consensus: {result['consensus_level']}\")
for r in result['reasoning'][:5]:
    print(f'  - {r[:100]}')
"
```

### 6. Testare il client LLM
```bash
python engine/llm_client.py
```
Dovrebbe stampare una risposta da Gemini Flash 2.0 via OpenRouter.

### 7. Dashboard (dev mode)
```bash
cd dashboard
npm install
npm run dev
```
Apri `http://localhost:3000`. La dashboard si connette direttamente a Supabase.

### 8. Eseguire i test
```bash
pytest tests/ -v --cov=. --cov-report=xml --cov-fail-under=25
```

### 9. Lint
```bash
flake8 scraper/ nlp/ engine/ --max-line-length=120
```
