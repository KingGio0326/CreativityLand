# ROADMAP.md

Roadmap di sviluppo del progetto **CreativityLand Trading Bot**.
Ultimo aggiornamento: 2026-03-23.

---

## COMPLETATO

- [x] 12 agenti attivi + ResearchAgent + RiskAgent (17 nodi totali nel grafo LangGraph)
- [x] Pattern matching con 3 livelli di boost (conferma +15%, smentisce -15%, neutro 0%)
- [x] Walk-forward validation MLAgent (XGBoost con k-fold temporale)
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

---

## IN ATTESA

| Cosa | Quando | Condizione |
|------|--------|------------|
| Score 168h disponibili | ~25 marzo 2026 | Primi segnali con 7 giorni di eta |
| Audit bias segnali | Fine marzo 2026 | Servono 50+ segnali BUY/SELL valutati |
| Ribilanciamento pesi agenti | Aprile 2026 | Dopo audit bias con dati reali |

---

## PROSSIMI STEP (priorita)

### 1. Regime Detection automatico
- Classificare il mercato corrente (bull/bear/neutral/crisis) automaticamente
- Usare VIX, SPY trend 30d, spread obbligazionari
- Integrare nel grafo come nodo pre-weighted per aggiustare pesi dinamicamente
- **Effort**: ~4 prompt

### 2. PatternMatching performance separata
- Tracciare hit rate del pattern matching indipendentemente dalla pipeline
- Confrontare segnale pattern vs outcome reale
- Visualizzare nella pagina `/performance`
- **Effort**: ~2 prompt

### 3. Score composito unificato gauge
- Creare un singolo "health score" che combina hit rate, avg score, alpha, consensus
- Visualizzare come gauge/meter nella homepage dashboard
- Utile per capire a colpo d'occhio se il sistema sta performando
- **Effort**: ~2 prompt

### 4. Discovery automatico nuovi ticker
- Analizzare trending topics dalle fonti scraper
- Suggerire ticker non monitorati che stanno generando buzz
- Notificare via Telegram quando un ticker sconosciuto ha 5+ articoli
- **Effort**: ~3 prompt

### 5. Versione locale/VPS
- Quando il sistema mostra edge positivo consistente (hit rate >55% su 168h)
- Migrare da GitHub Actions a cron locale o VPS
- Aggiungere paper trading via Alpaca API
- **Effort**: ~5 prompt

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
