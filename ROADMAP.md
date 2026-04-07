# ROADMAP.md

Roadmap di sviluppo del progetto **CreativityLand Trading Bot**.
Ultimo aggiornamento: 2026-04-07.

---

## COMPLETATO

- [x] 12 agenti attivi + ResearchAgent + RiskAgent + ExitStrategyAgent (18 agenti, 21 nodi totali nel grafo LangGraph)
- [x] Pattern matching con 3 livelli di boost (conferma +15%, smentisce -15%, neutro 0%)
- [x] Walk-forward validation MLAgent (XGBoost con k-fold temporale) → sostituito da Purged K-Fold CV
- [x] Kelly criterion position sizing (nel risk agent)
- [x] Geopolitica weighting (high 2.0x, medium 1.5x, low 1.2x + keyword expansion)
- [x] Matrice correlazione cross-asset (aggiornata ogni run)
- [x] Dark crypto theme + floating sidebar con icone custom PNG
- [x] Pagine dashboard: `/agents` `/patterns` `/performance` `/correlation` `/guide` `/finbert` `/articles` `/search`
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
- [x] Pipeline principale aggiornata da ogni 6h a ogni 2h: cron `37 1-23/2 * * *` in `bot.yml`. Più segnali giornalieri (12 run/die vs 4), timing sfalsato rispetto al position manager. (2026-03-31)
- [x] Position Manager workflow ogni 1h (`position_manager.yml`, cron `17 * * * *`): ratchet check SL/TP con conflict guard (skip se posizione aperta < 10 min), trailing stop check (chiusura manuale se trailing activation raggiunta senza bracket leg), orphan position check (confronto Alpaca vs Supabase con notifica Telegram). Script test locale `scripts/run_position_manager.py`. (2026-03-31)
- [x] Ratcheting Take Profit dinamico: `engine/ratchet_manager.py` — vecchio TP diventa nuovo SL (profitto lock-in), nuovo TP = vecchio TP + ATR × regime_mult. 6 condizioni in ordine cheapest-first (max ratchets, price≥TP, regime, proximity 80%/90%, velocity, RSI+volume). Safety: ATR≤0 → skip, ATR>15% prezzo → skip, sanity check livelli (price tra SL/TP, SL>entry, gap≥0.5%, TP≤120% price). PATCH Alpaca TP-first poi SL, post-PATCH verification, notifica Telegram per ratchet + alert critici (SL non aggiornato, verifica fallita). 3 nuove colonne `positions`: `ratchet_count`, `last_ratchet_at`, `ratchet_history`. `notify_ratchet()` in telegram_notifier. 20 test unitari. (2026-03-31)
- [x] Short Selling bidirectional: `engine/executor.py` — `_handle_sell()` distingue close-long vs open-short. `_open_short()` con crypto block, `MIN_SHORT_CONFIDENCE=0.60`, earnings protection via `_has_upcoming_earnings()` (yfinance calendar, 7 giorni). Integer shares only per bracket support. Validazione direzione SL/TP (TP<entry<SL) con fallback 2%/4%. `engine/broker_alpaca.py`: validazione direzione bracket (BUY: SL<TP, SELL: TP<SL) prima di inviare ordine Alpaca. `engine/ratchet_manager.py`: ratchet bidirezionale — SHORT progress=(entry−price)/(entry−tp), SHORT ratchet: new_tp=current_tp−ATR×mult, SHORT RSI floor (22 stocks/18 crypto), SHORT enforce_sl_tp invertito (sl_hit=price≥sl, tp_hit=price≤tp). `agents/exit_strategy_agent.py`: validazione direzione post-calcolo (return None se invertito), fix log sign SHORT (+sl_pct, -tp_pct). 31 test unitari in `tests/test_short_selling.py`. (2026-04-01)

---

## PROSSIMI STEP

> **Priorità strategica:** osservare e validare il sistema attuale prima di aumentare la complessità.
> Non aggiungere nuovi mercati, leva o broker finché il comportamento reale su Alpaca paper non è validato.
> Non migrare a locale/VPS finché GitHub Actions non diventa un vero collo di bottiglia.

---

### Fase 1 — Adesso: monitoraggio (1–2 settimane)

- Il trading è ATTIVO su Alpaca paper ($1k virtuali). Pipeline ogni 2h, position manager ogni 1h.
- Osservare senza intervenire sul codice. Raccogliere evidenza su trade reali prima di qualsiasi tuning.
- Verificare il comportamento reale di:
  - esecuzioni ordini (market, fractional, interi, short)
  - SL/TP: scattano al momento giusto e ai livelli corretti?
  - ratchet e trailing: funzionano su posizioni reali?
  - signal evaluations: il sistema si autovaluta correttamente a 6h/24h/72h/168h?
  - coerenza dashboard portfolio: equity, cash, P&L, posizioni
- **Condizione di successo**: ≥50 trade chiusi con comportamento del sistema comprensibile e prevedibile
- **Effort**: 0 prompt — solo osservazione

### Fase 2 — Tuning sulla base dei dati reali

- Analizzare i trade chiusi: win rate, avg P&L, distribuzione SL/TP/ratchet hit
- Confrontare performance per ticker: rimuovere ticker non profittevoli se confermato dai dati
- Calibrare soglie di confidence, pesi agenti, regime multiplier basandosi sui trade reali
- Ottimizzare ATR multiplier e R:R ratio usando i trade chiusi come dataset di validazione
- Non basare il tuning sullo scoring 168h come unica metrica — usare i trade reali
- **Effort**: ~3–5 prompt

### Fase 3 — Solo dopo baseline stabile: espansione broker/mercati

- Valutare solo dopo ≥3 mesi di track record reale con P&L positivo o breakeven
- Candidati principali:
  - **OANDA** — forex con leva, spread fissi, paper mode, API REST documentata
  - **Kraken Futures** — crypto con leva, costi bassissimi, funding ogni 8h
- Prerequisito tecnico: `BrokerAdapter` minimo in `executor.py` prima di aggiungere il 2° broker
- Riferimento completo: `docs/BROKER_EXPANSION_STRATEGY.md` (costi, confronto, ordine di espansione)
- **Effort**: ~5 prompt per broker

### Fase 4 — Più avanti: broker abstraction e IBKR

- Introdurre `BrokerAdapter` con `capability_flags` quando ci sono ≥2 broker attivi
- Integrare Interactive Brokers solo con ticket medio >€500, capitale >€5k, track record >6 mesi
- Aprire a futures/opzioni/global equities solo dopo IBKR consolidato

### Fase 5 — Locale/VPS solo se necessario

- **Non è la priorità immediata.** GitHub Actions è gratuito su repo pubblica e sufficiente per cicli da 2h.
- Migrare solo se emerge un vero limite operativo: latenza critica sul position manager, rate limit Actions, o necessità di connessione persistente.
- **Effort**: ~3 prompt

---

### Backlog (secondaria priorità)

- Discovery automatico nuovi ticker da trending scraper (notifica Telegram se 5+ articoli su ticker sconosciuto)
- Health gauge portfolio: singolo indicatore 0–100 in homepage basato su equity trend, win rate, drawdown, Sharpe
- Dashboard mobile ottimizzata

---

## COSTI

| Voce | Costo |
|------|-------|
| Supabase (free tier) | €0/mese |
| GitHub Actions | €0/mese (illimitato, repo pubblica) |
| Vercel (free tier) | €0/mese |
| NewsAPI (free tier) | €0/mese |
| OpenRouter (attuale) | €0/mese (crediti gratuiti) |
| Alpaca Paper Trading | €0/mese |
| **TOTALE ATTUALE** | **€0/mese** |

### Target futuri
| Voce | Costo stimato |
|------|---------------|
| OpenRouter (post-crediti) | €3-5/mese |
| StockNewsAPI (opzionale) | $9/mese |
| VPS (se migrazione) | €5-10/mese |
| **TARGET** | **€3-8/mese** (senza VPS) |
