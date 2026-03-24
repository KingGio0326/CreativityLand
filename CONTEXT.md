# CONTEXT.md

Documento di continuità per riprendere lo sviluppo del progetto **CreativityLand Trading Bot** in una nuova sessione.
Ultimo aggiornamento: 2026-03-23.

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
├── agents/                        # 17 agenti trading
│   ├── __init__.py                # TradingState TypedDict (28 campi)
│   ├── orchestrator.py            # LangGraph StateGraph + TradingOrchestrator
│   ├── weighted_signal_agent.py   # Voto pesato + pattern/research modifiers
│   ├── critic_agent.py            # Validazione qualità, retry condizionale
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
│       │   └── api/               # API routes
│       │       ├── performance/route.ts
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

### Pipeline LangGraph (ordine di esecuzione — 20 nodi)

```
regime → scraper → social → sentiment → research → fundamental → technical → options
→ momentum → mean_reversion → ml → risk → liquidity → macro → intermarket
→ seasonal → institutional → weighted → critic (conditional retry)
```

`regime` è il primo nodo: classifica il mercato come bull/bear/neutral/crisis usando VIX, SPY 30d trend + SMA50/200, TLT flight-to-safety. Il risultato viene propagato nel `TradingState` e usato dal `WeightedSignalAgent` per aggiustare i pesi.

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
ALPACA_API_KEY=            # paper trading (non attivo)
ALPACA_SECRET_KEY=

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

## 7. Stato Attuale del Sistema (2026-03-23)

| Metrica | Valore |
|---------|--------|
| Segnali totali generati | 255 |
| Valutazioni registrate | 201 |
| Valutazioni completate (168h) | 0 (primi score 168h disponibili ~25 marzo) |
| Articoli nel database | 4.776 |
| Pattern storici | 37.953 |
| Ultimo segnale generato | 2026-03-23 08:52 UTC |
| Ticker monitorati | AAPL, TSLA, NVDA, BTC-USD, ETH-USD, MSFT, XOM, GLD |

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

### Perché inline keyboard nel bot Telegram
Il bot è usato da mobile dove digitare comandi è scomodo. Con **inline keyboard** l'interazione è tutta a bottoni: menu → scegli ticker → vedi dettaglio → torna indietro. Zero typing richiesto.

### Perché detect_ticker() nello scraper
Feed generici (CNBC, Motley Fool, Investopedia) non sono ticker-specific. `detect_ticker()` usa keyword matching (es. "apple", "tim cook", "cupertino" → AAPL) per filtrare solo articoli rilevanti ai ticker monitorati, evitando di salvare articoli irrilevanti.

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
