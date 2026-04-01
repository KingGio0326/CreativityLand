# ROADMAP.md

Roadmap di sviluppo del progetto **CreativityLand Trading Bot**.
Ultimo aggiornamento: 2026-03-30.

---

## COMPLETATO

- [x] 12 agenti attivi + ResearchAgent + RiskAgent + ExitStrategyAgent (18 agenti, 21 nodi totali nel grafo LangGraph)
- [x] Pattern matching con 3 livelli di boost (conferma +15%, smentisce -15%, neutro 0%)
- [x] Walk-forward validation MLAgent (XGBoost con k-fold temporale) → sostituito da Purged K-Fold CV
- [x] Kelly criterion position sizing (nel risk agent)
- [x] Geopolitica weighting (high 2.0x, medium 1.5x, low 1.2x + keyword expansion)
- [x] Matrice correlazione cross-asset (aggiornata ogni run)
- [x] Dark crypto theme + floating sidebar con icone custom PNG
- [x] Pagine dashboard: `/agents` `/patterns` `/performance` `/correlation` `/guide` `/finbert` `/articles` `/backtest` `/search`
- [x] Performance con 4 orizzonti (6h / 24h / 72h / 168h) + StatCard collassabili con formula
- [x] Telegram bot `@CreativityLand_bot` con inline keyboard (zero typing)
- [x] Multi-user Telegram via `TELEGRAM_CHAT_IDS` (comma-separated)
- [x] Migrazione LLM → OpenRouter Gemini Flash 2.0 (fallback Llama 3.3 70B)
- [x] Scraper ottimizzato (8 nuove fonti, `extract_content_safe()` fallback RSS, `detect_ticker()` keyword matching)
- [x] HOLD escluso dalle performance stats (score=0, filtrato in API e UI)
- [x] Fix double multiplication return values in API
- [x] Lazy Supabase init nel bot Telegram (`get_supabase()`)
- [x] Pulizia articoli con contenuto vuoto/corto da Supabase (352 rimossi)
- [x] Rimozione fonti broken (Seeking Alpha, MarketWatch, Benzinga, Investopedia, TheStreet, Google News diretto, Reuters, Zacks)
- [x] Fix detect_ticker() per feed generici (CNBC, Motley Fool, AP News) — 59 falsi positivi eliminati
- [x] Verifica output scraper ottimizzato (Step 1 completato 2026-03-23)
- [x] Regime Detection automatico: VIX/SPY/TLT → bull/bear/neutral/crisis con pesi dinamici (2026-03-23)
- [x] Pattern Matching performance tracking indipendente (tabella `pattern_evaluations`, API `/api/patterns-performance`, sezione UI in `/patterns`) (2026-03-23)
- [x] Regime integrato nei messaggi Telegram: header run message, weekly report con regime prevalente + VIX range, dettaglio ticker con regime, bottone `Regime` nel menu bot (2026-03-23)
- [x] Dashboard Pattern Performance: hit rate totale, breakdown per regime (bar chart), breakdown per prediction type, tabella ultime 20 valutazioni (2026-03-23)
- [x] ExitStrategyAgent (SL/TP/Trailing): ATR-14 based con regime multiplier (crisis 3.0x, bear 2.5x, neutral 2.0x, bull 1.5x), R:R 2.0-3.0, trailing stop al 50% TP, crypto usa hourly data (2026-03-26)
- [x] Tabelle `positions` e `trades` + `portfolio_summary` view su Supabase (2026-03-26)
- [x] Pagina `/trades` con posizioni Alpaca live, trade history, summary cards (2026-03-26)
- [x] Portfolio SL/TP managed chart (5° grafico equity curve) con trade markers e exit reason badges (2026-03-26)
- [x] SL/TP colonne nella tabella segnali di `/performance` + notifica Telegram con livelli SL/TP (2026-03-26)
- [x] Fase 3 Execution Engine: `engine/executor.py` (TradeExecutor) + `engine/broker_alpaca.py` (Alpaca REST adapter). Safety checks: confidence/consensus gate, max positions, daily loss circuit breaker, market hours, cooldown. Bracket orders con SL/TP automatici. DB tracking in positions/trades (2026-03-26)
- [x] Fase 4 Safety Layer: 9 pre-flight checks (+ price staleness, max drawdown 15% da picco). Notifiche Telegram per ordini aperti/chiusi, circuit breaker, emergency close, max drawdown. Kill switch `/stop_trading` + `/start_trading` nel bot Telegram. Bottone "Trading" nel menu con status portafoglio e posizioni live. Tabella `portfolio_peak` per tracking picco equity (2026-03-27)
- [x] Fase 5 Integrazione Pipeline: step "Execute trades" in `bot.yml` dopo save_signal(). Env vars `TRADING_ENABLED` (default false) e `PAPER_TRADING` (default true) come GitHub Secrets. TradeExecutor legge `PAPER_TRADING` da env. Flusso: scrape → agenti → save_signal → execute_signal → evaluate → notify (2026-03-27)
- [x] Portfolio page `/portfolio`: pagina dedicata con equity curve live (Alpaca), stat cards (equity, cash, daily/total P&L), tabella posizioni con SL/TP, trade history. API route `/api/portfolio` chiama 5 endpoint Alpaca in parallelo + lookup SL/TP da Supabase. SCALE_FACTOR=100 per simulare budget $1k su account $100k. Auto-refresh 60s quando mercato aperto (2026-03-30)
- [x] Cleanup: rimosso grafico SL/TP Managed da `/performance`, deprecato `/trades` (redirect a `/portfolio`), deprecate API routes `/api/equity-curve-sltp` e `/api/trades`, rimosso TRADING dalla sidebar (2026-03-30)
- [x] Triple Barrier Labeling (López de Prado AFML cap. 3): `engine/triple_barrier.py` con barriere ATR-based per regime (crisis 3.0x, bear 2.5x, neutral 2.0x, bull 1.5x). Integrato in `scoring_engine.py` evaluate_pending(). Colonne `barrier_label`, `barrier_hit`, `barrier_hit_hours`, `max_favorable_pct`, `max_adverse_pct` in `signal_evaluations`. Backfill script `scripts/backfill_triple_barrier.py` (2026-03-30)
- [x] Fractional Differentiation (López de Prado AFML cap. 5): FFD features per MLAgent (`close_ffd`, `high_ffd`, `low_ffd`, `volume_ffd`), d ottimale con ADF test (min d per p<0.05), caching in Supabase `ml_feature_params`. `engine/fractional_diff.py` con `get_weights_ffd()`, `frac_diff_ffd()`, `find_optimal_d()`. Threshold=1e-3 per finestra ~27 pesi su 504 daily bars. 12 test unitari. (2026-03-30)
- [x] Purged K-Fold Cross-Validation (López de Prado AFML cap. 7): `engine/purged_kfold.py` (PurgedKFoldCV) sostituisce TimeSeriesSplit nel MLAgent. Purging rimuove sample con label leakage, embargo 1% aggiunge buffer post-test. Colonne `cv_method`, `embargo_pct`, `n_purged` in `ml_validation`. Vecchio walk-forward commentato come riferimento. 13 test unitari. (2026-03-31)
- [x] Meta-Labeling (López de Prado AFML cap. 3.6): `agents/meta_labeling_agent.py` — meta-model XGBoost per calibrazione confidence basato su triple barrier outcomes. Nodo `meta_labeling` nel grafo LangGraph dopo `weighted` e prima di `critic` (22 nodi). 23 features (voti agenti, regime, pattern, consensus). Modello persistito in Supabase `ml_models` come JSON, retraining domenicale. Graceful degradation senza modello. 19 test unitari. (2026-03-31)
- [x] Pipeline principale aggiornata da ogni 6h a ogni 2h: cron `0 */2 * * *` in `bot.yml`. Più segnali giornalieri (12 run/die vs 4), timing sfalsato rispetto al position manager. (2026-03-31)
- [x] Position Manager workflow ogni 1h (`position_manager.yml`, cron `30 * * * *`): ratchet check SL/TP con conflict guard (skip se posizione aperta < 10 min), trailing stop check (chiusura manuale se trailing activation raggiunta senza bracket leg), orphan position check (confronto Alpaca vs Supabase con notifica Telegram). Script test locale `scripts/run_position_manager.py`. (2026-03-31)
- [x] Ratcheting Take Profit dinamico: `engine/ratchet_manager.py` — vecchio TP diventa nuovo SL (profitto lock-in), nuovo TP = vecchio TP + ATR × regime_mult. 6 condizioni in ordine cheapest-first (max ratchets, price≥TP, regime, proximity 80%/90%, velocity, RSI+volume). Safety: ATR≤0 → skip, ATR>15% prezzo → skip, sanity check livelli (price tra SL/TP, SL>entry, gap≥0.5%, TP≤120% price). PATCH Alpaca TP-first poi SL, post-PATCH verification, notifica Telegram per ratchet + alert critici (SL non aggiornato, verifica fallita). 3 nuove colonne `positions`: `ratchet_count`, `last_ratchet_at`, `ratchet_history`. `notify_ratchet()` in telegram_notifier. 20 test unitari. (2026-03-31)
- [x] Short Selling bidirectional: `engine/executor.py` — `_handle_sell()` distingue close-long vs open-short. `_open_short()` con crypto block, `MIN_SHORT_CONFIDENCE=0.60`, earnings protection via `_has_upcoming_earnings()` (yfinance calendar, 7 giorni). Integer shares only per bracket support. Validazione direzione SL/TP (TP<entry<SL) con fallback 2%/4%. `engine/broker_alpaca.py`: validazione direzione bracket (BUY: SL<TP, SELL: TP<SL) prima di inviare ordine Alpaca. `engine/ratchet_manager.py`: ratchet bidirezionale — SHORT progress=(entry−price)/(entry−tp), SHORT ratchet: new_tp=current_tp−ATR×mult, SHORT RSI floor (22 stocks/18 crypto), SHORT enforce_sl_tp invertito (sl_hit=price≥sl, tp_hit=price≤tp). `agents/exit_strategy_agent.py`: validazione direzione post-calcolo (return None se invertito), fix log sign SHORT (+sl_pct, -tp_pct). 31 test unitari in `tests/test_short_selling.py`. (2026-04-01)

---

## IN ATTESA

| Cosa | Quando | Condizione |
|------|--------|------------|
| Score 168h disponibili | ~25 marzo 2026 | Primi segnali con 7 giorni di eta |
| Audit bias segnali | Fine marzo 2026 | Servono 50+ segnali BUY/SELL valutati |
| Ribilanciamento pesi agenti | Aprile 2026 | Dopo audit bias con dati reali |

---

## COMPLETATO QUESTA SESSIONE (2026-03-23)

### ~~Step 1: Regime Detection automatico~~ ✅
- `engine/regime_detector.py`: VIX + SPY trend/SMA + TLT flight-to-safety → bull/bear/neutral/crisis
- Nodo `regime` come primo step nel grafo LangGraph (20 nodi totali)
- Pesi agenti regolati per regime: crisis (sentiment 1.5x, macro 2.0x, momentum 0.5x), bear (sentiment 1.3x, macro 1.5x, momentum 0.7x), bull (momentum 1.3x, ml 1.2x, fundamental 1.2x)
- Cache 6h in tabella Supabase `market_regime`
- `market_regime` e `regime_confidence` esposti nel risultato di `decide()`
- Regime integrato nel reasoning: `RegimeDetector: BEAR (50%)` + `WeightedVote: ... regime=BEAR [...]`

### ~~Step 2: Pattern Matching performance tracking~~ ✅
- Tabella `pattern_evaluations` con signal_id, prediction, boost, regime, actual_return, pattern_correct
- `save_pattern_evaluation()` in `scoring_engine.py` — salva dopo ogni segnale se patterns_matched > 0
- `evaluate_pattern_performance()` — valuta dopo 168h: correct se bullish+return>0 o bearish+return<0
- `save_signal()` ora ritorna il signal UUID
- `pattern_data` dict nel risultato dell'orchestrator (prediction, boost, patterns_matched, regime)
- Integrato nel workflow `bot.yml` (step 4b: save, step 7b: evaluate)

### ~~Step 3: Regime nei messaggi Telegram~~ ✅
- Run message: header `🔴 Mercato: BEAR (50%) -- VIX 29.7 | SPY 30d -5.0%` + nota modifier pesi
- Weekly report: regime prevalente, VIX range min-max, distribuzione per regime
- Bot inline: regime nel dettaglio ticker (`_get_regime_line()`)
- Bottone `🌍 Regime` nel menu principale con dettaglio indicatori

### ~~Step 4: Dashboard Pattern Performance~~ ✅
- API route `/api/patterns-performance`: hit_rate, by_regime, by_prediction, recent 20
- Sezione UI in `/patterns/page.tsx`: stat cards (Hit Rate, Avg Boost, Bullish/Bearish Acc.), bar chart per regime, tabella valutazioni
- Empty state con messaggio "risultati dal ~30 marzo"

---

## PROSSIMI STEP (priorità)

### 0. Score composito unificato gauge
- Creare un singolo "health score" che combina hit rate, avg score, alpha, consensus
- Visualizzare come gauge/meter nella homepage dashboard
- Utile per capire a colpo d'occhio se il sistema sta performando
- **Effort**: ~2 prompt

### 2. Discovery automatico nuovi ticker
- Analizzare trending topics dalle fonti scraper
- Suggerire ticker non monitorati che stanno generando buzz
- Notificare via Telegram quando un ticker sconosciuto ha 5+ articoli
- **Effort**: ~3 prompt

### 3. Backtest SL/TP optimization
- Testare diversi multiplier ATR (1.0x, 1.5x, 2.0x, 2.5x, 3.0x) e R:R ratio (1.5, 2.0, 2.5, 3.0)
- Trovare la combinazione ottimale per massimizzare il portfolio value nel SL/TP managed chart
- Confrontare win rate e R:R con diversi regime multiplier
- **Effort**: ~3 prompt

### 4. Versione locale/VPS
- Quando il sistema mostra edge positivo consistente (hit rate >55% su 168h)
- Migrare da GitHub Actions a cron locale o VPS
- Paper trading via Alpaca già implementato (Fase 3-5)
- **Effort**: ~3 prompt

---

## COSTI

| Voce | Costo |
|------|-------|
| Supabase (free tier) | €0/mese |
| GitHub Actions | €0/mese |
| Vercel (free tier) | €0/mese |
| NewsAPI (free tier) | €0/mese |
| OpenRouter (attuale) | €0/mese (crediti gratuiti) |
| **TOTALE ATTUALE** | **€0/mese** |

### Target futuri
| Voce | Costo stimato |
|------|---------------|
| OpenRouter (post-crediti) | €3-5/mese |
| StockNewsAPI (opzionale) | $9/mese |
| VPS (se migrazione) | €5-10/mese |
| **TARGET** | **€3-8/mese** (senza VPS) |
