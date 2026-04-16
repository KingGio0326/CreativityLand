# CreativityLand Local — Piano Tecnico Completo

**Data:** 2026-04-16  
**Stato:** Piano documentale — nessun codice implementato  
**Autore:** Analisi architetturale per fork local-first  
**Progetto originale:** CreativityLand Trading Bot (cloud-first, Alpaca paper, GitHub Actions)

> **Regola fondamentale:** questo documento descrive un fork sperimentale separato.
> Il progetto cloud-first attuale **non viene toccato** durante questa fase.
> GitHub Actions + Supabase + Vercel + Alpaca restano operativi e invariati.

---

## 1. Executive Summary

### Perché creare un fork local-first

Il progetto attuale è progettato per girare interamente su infrastruttura cloud gratuita:
GitHub Actions come runtime operativo, Supabase come database, Vercel come dashboard.
Questa architettura è corretta e sufficiente per Alpaca paper trading con cicli ogni 2h.

Il limite emerge quando si vuole integrare **MetaTrader 5 / FTMO**: MT5 richiede un terminale
Windows con sessione persistente, impossibile su runner Linux GitHub Actions.
Inoltre, per trading con prop firm o broker non-Alpaca, avere il runtime controllato localmente
riduce i rischi di dipendenza da servizi cloud terzi e aumenta la flessibilità operativa.

Il fork "CreativityLand Local" nasce come variante sperimentale che:
- gira su PC Windows / Windows Server / VPS Windows
- sostituisce Supabase con un DB locale (SQLite o PostgreSQL locale)
- sostituisce GitHub Actions con uno scheduler locale (Task Scheduler / NSSM / APScheduler)
- sostituisce Vercel con una dashboard Next.js servita localmente
- astraiisce Alpaca in un adapter intercambiabile con MT5/FTMO
- mantiene GitHub solo per versioning e distribuzione del codice

### Cosa resta nel progetto attuale (cloud-first)

- GitHub Actions: pipeline segnali ogni 2h + position manager ogni 1h
- Supabase: DB cloud con tutte le tabelle esistenti
- Vercel: dashboard pubblica
- Alpaca: unico broker attivo (paper trading)
- Telegram: notifiche push
- OpenRouter: LLM (Gemini Flash 2.0 / Llama 3.3)
- yfinance: dati storici per ML e scoring

**Il progetto cloud resta il progetto principale e non viene modificato.**

### Cosa cambia nel fork locale

- Runtime: daemon Python persistente su Windows invece di runner GitHub Actions
- Database: SQLite o PostgreSQL locale invece di Supabase cloud
- Dashboard: Next.js su localhost/LAN invece di Vercel
- Broker: MT5 come target principale, Alpaca come adapter opzionale
- Scheduler: Windows Task Scheduler o NSSM invece di cron GitHub Actions
- Market data: fonte nativa broker (MT5 tick) come primaria, yfinance solo fallback
- Secrets: `.env.local` su file system locale invece di GitHub Secrets

### Benefici

| Beneficio | Dettaglio |
|-----------|-----------|
| MT5/FTMO ready | Unica architettura compatibile con terminale MetaTrader persistente |
| Zero dipendenza cloud | Funziona senza Supabase, Vercel, GitHub Actions |
| Latenza ridotta | Dati e ordini viaggiano in locale o su VPS vicino al broker |
| Costo controllato | Nessun consumo di free tier cloud durante i test locali |
| Ownership completa | Nessun rischio di service degradation Supabase/Vercel/GitHub in orario di trading |
| Debug più semplice | Log locali, DB locale ispezionabile, nessun latency cloud |

### Rischi

| Rischio | Gravità | Mitigazione |
|---------|---------|-------------|
| Doppia esecuzione (locale + cloud) | **Critica** | Un solo sistema comanda ogni broker. Mai contemporaneamente |
| Uptime PC portatile | Alta | VPS Windows per produzione; portatile solo per test |
| Backup DB locale | Alta | Backup automatico giornaliero + copia remota |
| No audit trail cloud | Media | Log su file locale + eventuale replica Supabase opzionale |
| Dipendenza sessione MT5 | Alta | Watchdog + auto-reconnect + alert Telegram |
| Secrets su disco locale | Media | .env con permessi ristretti + Windows Credential Manager |

---

## 2. Differenza tra progetto attuale e fork locale

| Componente | Cloud-First (attuale) | Local-First (fork) |
|------------|----------------------|-------------------|
| **Runtime** | GitHub Actions (runner Ubuntu, stateless) | Daemon Python su Windows, persistente |
| **Database** | Supabase PostgreSQL + pgvector (cloud) | SQLite (MVP) o PostgreSQL locale (produzione) |
| **Dashboard** | Vercel (Next.js CDN, URL pubblico) | Next.js su localhost:3000 / LAN / Tailscale |
| **Broker** | Alpaca REST (unico, obbligatorio) | BrokerAdapter: MT5 principale, Alpaca opzionale |
| **Market data** | yfinance (primario e fallback) | MT5 tick (primario), Alpaca MD (se Alpaca), yfinance (fallback/analisi) |
| **Scheduler** | GitHub Actions cron YAML | Windows Task Scheduler o NSSM + APScheduler |
| **Logging** | GitHub Actions log (solo durante run) | File locali persistenti + rotazione giornaliera |
| **Secrets** | GitHub Secrets (cloud-managed) | `.env.local` su file system, permessi Windows |
| **Alert** | Telegram (obbligatorio, push) | Telegram (preferito) + log locale + alert email opzionale |
| **Deployment** | git push → Actions auto-trigger | git pull manuale → riavvio daemon |
| **Backup** | Supabase backup automatico | Script backup locale giornaliero + copia su NAS/cloud |
| **Risk management** | Soft: circuit breaker in executor.py | Soft + FTMO hard rules: daily loss, max drawdown, trading days |
| **pgvector** | Nativo Supabase | pgvector su PostgreSQL locale (non disponibile su SQLite) |
| **ML retraining** | Domenicale su GitHub Actions | Task Scheduler domenicale locale |
| **CI/CD** | GitHub Actions test.yml + deploy.yml | Test locali manuali; nessun deploy automatico |
| **Costo infrastruttura** | €0/mese (free tier) | €0 (portatile) o €10–20/mese (VPS Windows) |

---

## 3. Dipendenze cloud attuali da rimuovere o astrarre

### 3.1 Supabase

Supabase è il componente con più dipendenze nel codice attuale.

| File / Modulo | Ruolo attuale | Alternativa locale | Difficoltà | Rischio |
|---------------|-------------|-------------------|------------|---------|
| `engine/broker_alpaca.py` | Nessuna diretta (usa httpx) | — | — | — |
| `engine/scoring_engine.py` | Legge/scrive `signal_evaluations`, `signals`, `positions` | Repository locale SQLite/PG | Media | Schema migration, query adattamenti |
| `engine/ratchet_manager.py` | Legge `positions`, scrive ratchet history | Repository locale | Media | Concorrenza accesso locale |
| `engine/regime_detector.py` | Cache 6h in `market_regime` | Cache locale (JSON file o SQLite) | Bassa | Nessuna |
| `engine/executor.py` | Legge/scrive `positions`, `trades`, `portfolio_peak` | Repository locale | Media | Transazionalità da verificare |
| `engine/pattern_matcher.py` | pgvector cosine similarity su `price_patterns` | pgvector locale (PostgreSQL) o fallback numpy | Alta | pgvector non disponibile su SQLite |
| `nlp/sentiment.py` | Scrive `articles` con sentiment | Repository locale | Bassa | Solo INSERT/UPDATE |
| `nlp/embeddings.py` | Scrive `articles.embedding` (pgvector 384-dim) | pgvector locale (richiede PostgreSQL) | Alta | SQLite non supporta pgvector |
| `agents/scraper_agent.py` | Legge `articles` da Supabase | Repository locale | Bassa | — |
| `agents/ml_prediction_agent.py` | Legge/scrive `ml_models`, `ml_validation`, `ml_feature_params` | File locale JSON + SQLite metadata | Media | Gestione file vs DB |
| `bot_telegram/telegram_bot.py` | `get_supabase()` lazy init | Repository locale via dependency injection | Media | Refactor DI |
| `bot_telegram/telegram_notifier.py` | Nessuna dipendenza diretta Supabase | — | — | — |
| `dashboard/src/lib/supabase.ts` | Client Supabase Next.js | Client PostgreSQL locale o SQLite (via API route locale) | Alta | Tutta la dashboard va riconfigurata |
| `dashboard/src/app/api/*/route.ts` | 15+ API routes che chiamano Supabase | API routes che chiamano DB locale | Alta | Refactor completo API layer |
| `.github/workflows/position_manager.yml` | Usa Supabase via Python inline | Processo locale schedulato | Alta | Riscrittura workflow in daemon |
| `.github/workflows/bot.yml` | Ogni step usa Supabase | Daemon locale con step sequenziali | Alta | Riscrittura completa runtime |

### 3.2 Vercel / Next.js deployment

| File / Modulo | Ruolo attuale | Alternativa locale | Difficoltà | Rischio |
|---------------|-------------|-------------------|------------|---------|
| `dashboard/` | Next.js app su Vercel CDN | `npm run dev` / `npm run start` su localhost | Bassa | Nessuna — stesso codice |
| `vercel.json` (se presente) | Config deploy Vercel | Non necessario in locale | Bassa | — |
| `.github/workflows/deploy.yml` | Deploy automatico su push | Non necessario in locale | Bassa | Rimuovere o disabilitare |

**Nota importante:** la dashboard Next.js funziona identicamente in locale. Il vero sforzo
è riconfigurare le API routes per puntare al DB locale invece di Supabase.

### 3.3 GitHub Actions workflows

| Workflow | Ruolo attuale | Alternativa locale | Difficoltà | Rischio |
|----------|-------------|-------------------|------------|---------|
| `bot.yml` (ogni 2h) | Pipeline completa: scrape → NLP → agenti → execute → score | Daemon Python schedulato localmente | Alta | Riscrittura orchestrazione; gestione errori senza retry Actions |
| `position_manager.yml` (ogni 1h) | Ratchet + trailing + orphan check | Job schedulato ogni 20-60 min | Media | Già script Python; solo aggiungere scheduler |
| `test.yml` | CI lint + pytest | Test locali manuali / pre-commit hook | Bassa | Nessuna |
| `deploy.yml` | Deploy Vercel | Non necessario in locale | Bassa | — |

### 3.4 Alpaca come broker obbligatorio

| File / Modulo | Ruolo attuale | Alternativa locale | Difficoltà | Rischio |
|---------------|-------------|-------------------|------------|---------|
| `engine/broker_alpaca.py` | Unico adapter broker | Diventa `AlpacaBrokerAdapter` (uno dei possibili) | Bassa | Nessuna se si crea il Protocol |
| `engine/executor.py` | Hardcoded `AlpacaBroker` | Usa `BrokerAdapter` Protocol + dependency injection | Media | Pre-flight checks vanno generalizzati |
| `engine/ratchet_manager.py` | Chiama `AlpacaBroker` direttamente | Usa adapter astratto | Media | Metodi PATCH/verifica specifici Alpaca |

### 3.5 yfinance come fonte prezzi

| File / Modulo | Ruolo attuale | Alternativa locale | Difficoltà | Rischio |
|---------------|-------------|-------------------|------------|---------|
| `engine/scoring_engine.py` | Prezzi storici per scoring | yfinance resta OK per scoring batch | Bassa | Solo latenza/rate limit |
| `engine/executor.py` | `has_upcoming_earnings()` via yfinance | yfinance OK per query calendar | Bassa | — |
| `engine/technical_analysis.py` | Dati OHLCV storici | yfinance OK per analisi storica | Bassa | — |
| `position_manager.yml` | `broker.get_latest_price()` usa Alpaca MD | MT5 feed per posizioni MT5 | Media | Routing per broker |

**Regola nel fork locale:** yfinance = solo analisi batch e dati storici. Mai fonte primaria
per prezzi live su posizioni aperte.

### 3.6 Telegram come unico alert

Telegram va mantenuto come canale primario. Nel fork locale aggiungere:
- Log su file locale come fallback
- Eventuale alert email via `smtplib` se Telegram non raggiungibile

### 3.7 Environment variables / GitHub Secrets

| Attuale | Fork locale |
|---------|------------|
| GitHub Secrets (cloud-managed) | `.env.local` su file system Windows |
| Accesso via `os.getenv()` | Identico — `load_dotenv('.env.local')` |
| Rotazione via GitHub UI | Rotazione manuale, copia cifrata in backup |

---

## 4. Architettura target full local

### Diagramma

```
Windows Machine (PC / VPS Windows)
│
├─── Local Database Layer
│    ├─ SQLite (MVP) → database.db
│    └─ PostgreSQL locale (produzione) → porta 5432 locale
│         └─ pgvector extension (per embeddings e pattern matching)
│
├─── Bot Runtime (daemon Python)
│    ├─ main_daemon.py          — entry point, loop principale
│    ├─ pipeline_runner.py      — equivalente bot.yml (step sequenziali)
│    ├─ position_manager_local.py — equivalente position_manager.yml
│    ├─ scoring_runner.py       — evaluate_pending() schedulato
│    └─ retrain_runner.py       — ML retraining domenicale
│
├─── Scheduler
│    ├─ Windows Task Scheduler (MVP) — trigger .bat o .py
│    └─ NSSM (produzione) — daemon Windows come servizio
│
├─── Dashboard (localhost)
│    ├─ Next.js su localhost:3000
│    ├─ API routes → DB locale (PostgreSQL/SQLite)
│    └─ Accesso remoto via Tailscale VPN (no porte aperte)
│
├─── MT5 Terminal (MetaTrader 5)
│    ├─ Terminale MT5 installato e loggato al broker
│    ├─ Sessione persistente (non chiudere mai il terminale)
│    └─ Connessione broker: FTMO / prop firm / MT5 broker
│
├─── MT5 Bridge (Python)
│    ├─ mt5_bridge.py           — wrapper MetaTrader5 package
│    ├─ Apre/chiude ordini via mt5.order_send()
│    ├─ Legge prezzi tick via mt5.symbol_info_tick()
│    ├─ Legge posizioni via mt5.positions_get()
│    └─ Reconnect automatico con backoff esponenziale
│
├─── BrokerAdapter Layer
│    ├─ broker_adapter.py       — Protocol (interfaccia astratta)
│    ├─ broker_alpaca_adapter.py — wrapper AlpacaBroker esistente
│    ├─ broker_mt5_adapter.py   — wrapper MT5Bridge
│    └─ broker_paper_local.py  — simulazione locale (no broker reale)
│
├─── MarketDataRouter
│    ├─ market_data_router.py   — routing per broker
│    ├─ AlpacaMarketDataAdapter — Alpaca Market Data API
│    ├─ MT5MarketDataAdapter    — mt5.symbol_info_tick()
│    └─ YahooFinanceAdapter     — fallback analisi storica
│
├─── Risk Manager (FTMO-aware)
│    ├─ risk_manager_local.py
│    ├─ Monitor daily loss (max -5%)
│    ├─ Monitor max drawdown (max -10% da equity iniziale)
│    ├─ Counter trading days (min 10 in 30)
│    └─ Kill switch: blocca tutto se limiti superati
│
├─── Watchdog
│    ├─ watchdog.py             — monitora processi critici
│    ├─ Verifica daemon attivo ogni 5 min
│    ├─ Verifica MT5 aperto e connesso
│    ├─ Verifica DB raggiungibile
│    ├─ Verifica heartbeat su Supabase (opzionale, se cloud abilitato)
│    └─ Alert Telegram se qualcosa non risponde
│
├─── Heartbeat
│    ├─ heartbeat.py            — scrive timestamp ogni 5 min
│    ├─ Target: tabella locale `runtime_heartbeat`
│    └─ Opzionale: anche su Supabase per visibilità remota
│
├─── Alert Manager
│    ├─ alert_manager.py
│    ├─ Telegram (primario)
│    └─ Log locale (fallback)
│
├─── Log Manager
│    ├─ logs/ directory
│    ├─ Rotazione giornaliera (max 30 giorni)
│    ├─ Un file per componente (daemon, position_manager, mt5_bridge, watchdog)
│    └─ Copia su Supabase opzionale (solo ordini eseguiti)
│
└─── Backup Manager
     ├─ backup_manager.py
     ├─ Backup DB giornaliero → .sql dump o .db copy
     ├─ Backup .env.local cifrato
     └─ Copia su NAS locale o cloud drive cifrato
```

### Flussi principali nel fork locale

```
[Scheduler → ogni 2h]
Task Scheduler / NSSM
    └─ pipeline_runner.py
        ├─ NewsScraper.run_all() → scrape → ArticleRepository (locale)
        ├─ SentimentAnalyzer.process_unanalyzed() → ArticleRepository
        ├─ EmbeddingEngine.process_unembedded() → ArticleRepository
        ├─ TradingOrchestrator.decide() per ogni ticker → SignalRepository (locale)
        ├─ TradeExecutor.execute_signal() → BrokerAdapter → MT5Bridge / AlpacaAdapter
        ├─ ScoringEngine.evaluate_pending() → SignalEvaluationRepository
        └─ TelegramNotifier.notify()

[Scheduler → ogni 20 min]
Task Scheduler
    └─ position_manager_local.py
        ├─ RatchetManager.check_all_positions() → BrokerAdapter
        ├─ TrailingStopCheck → BrokerAdapter + MarketDataRouter
        ├─ OrphanPositionCheck → BrokerAdapter vs PositionRepository
        ├─ RiskManager.check_limits() → kill switch se necessario
        └─ TelegramNotifier.notify()

[Daemon permanente]
heartbeat.py → ogni 5 min → runtime_heartbeat (locale)
watchdog.py → ogni 5 min → verifica processi + MT5 + DB
```

---

## 5. Scelta DB locale

### Confronto

| Criterio | SQLite | PostgreSQL locale | Supabase Local (Docker) |
|----------|--------|-------------------|------------------------|
| **Setup** | Zero — file singolo | ~10 min install | ~30 min Docker setup |
| **Dipendenze** | Nessuna | PostgreSQL service | Docker + Supabase stack |
| **pgvector** | ❌ Non disponibile | ✅ Via extension | ✅ Incluso |
| **Concorrenza** | Limitata (WAL mode) | Piena (MVCC) | Piena |
| **Backup** | Copia file .db | pg_dump | pg_dump o snapshot Docker |
| **Migrazioni** | Manuale SQL o Alembic | Alembic | Alembic |
| **Dashboard locale** | SQLite viewer o API custom | pgAdmin / psql / API | Supabase Studio (Docker) |
| **Query storiche** | OK per volume nostro | OK + indici avanzati | OK |
| **Compatibilità schema** | Schema adattato (no pgvector) | Schema identico a Supabase | Schema identico — drop-in |
| **Resource usage** | Minimo | ~100MB RAM | ~2GB RAM (Docker stack) |
| **Windows** | Nativo Python | Installer PostgreSQL | Docker Desktop necessario |
| **Manutenzione** | Quasi zero | Minima | Media (Docker lifecycle) |
| **Costo** | €0 | €0 | €0 |

### Raccomandazione

**Per MVP locale (prime fasi di test):** SQLite

- Zero setup, zero dipendenze
- Perfetto per le prime fasi dove non servono embedding/pgvector
- Schema adattato (rimuovi colonne pgvector, usa numpy per similarity se necessario)
- Con Python `sqlite3` nativo — nessun driver aggiuntivo
- Limitazione principale: scrittura concorrente limitata (un writer alla volta) — accettabile
  per il nostro caso (un solo daemon writer alla volta)

**Per produzione locale (Fase 4+):** PostgreSQL locale

- Schema identico a Supabase (migrazione quasi zero per il codice)
- pgvector disponibile via `CREATE EXTENSION vector` — pattern matching funziona identicamente
- Concorrenza reale per letture parallele (daemon + dashboard)
- pg_dump per backup standard
- Installer Windows ufficiale (postgresql.org) — semplice

**Supabase Local via Docker:** sconsigliato per MVP

- Overhead Docker Desktop su Windows (~2GB RAM dedicati)
- Complessità superiore per benefici marginali rispetto a PostgreSQL diretto
- Ha senso solo se vuoi testare con lo stesso stack Supabase (autenticazione, RLS, API)
  che nel fork locale non ti servono

**Cosa richiede meno refactor:** PostgreSQL locale — il codice usa `supabase-py` client che
però costruisce query via `.table().select().eq()`. Questo va comunque refactorizzato nel
Data Access Layer. Con PostgreSQL locale usi `psycopg2` o `asyncpg` con SQL identico
al DDL di Supabase.

**Cosa richiede più affidabilità:** PostgreSQL locale — WAL, ACID, backup via pg_dump,
recovery point. SQLite in WAL mode è affidabile ma meno robusto su crash con scritture
simultanee.

---

## 6. Data Access Layer

### Il problema attuale

Il codice usa `supabase-py` ovunque con pattern diretto:

```python
# Pattern attuale — hardcoded Supabase
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
result = supabase.table('signals').select('*').eq('ticker', ticker).execute()
```

Questo va astratto in repository che nascondono il backend storage.

### Interfacce Repository (Protocol)

```python
# engine/repositories/base.py
from typing import Protocol, Any

class SignalRepository(Protocol):
    def save_signal(self, signal: dict) -> str: ...
    def get_latest_signal(self, ticker: str) -> dict | None: ...
    def get_pending_signals(self) -> list[dict]: ...
    def update_signal(self, signal_id: str, data: dict) -> None: ...

class PositionRepository(Protocol):
    def get_open_positions(self) -> list[dict]: ...
    def get_position(self, ticker: str) -> dict | None: ...
    def save_position(self, position: dict) -> str: ...
    def update_position(self, position_id: str, data: dict) -> None: ...
    def close_position(self, position_id: str, close_data: dict) -> None: ...

class ArticleRepository(Protocol):
    def save_articles(self, articles: list[dict]) -> int: ...
    def get_unanalyzed(self, limit: int) -> list[dict]: ...
    def get_unembedded(self, limit: int) -> list[dict]: ...
    def update_sentiment(self, article_id: str, sentiment: dict) -> None: ...
    def update_embedding(self, article_id: str, embedding: list[float]) -> None: ...

class PortfolioRepository(Protocol):
    def get_portfolio_peak(self) -> float: ...
    def update_portfolio_peak(self, equity: float) -> None: ...
    def get_market_regime(self) -> dict | None: ...
    def save_market_regime(self, regime: dict) -> None: ...

class SignalEvaluationRepository(Protocol):
    def save_evaluation(self, evaluation: dict) -> None: ...
    def get_pending_evaluations(self) -> list[dict]: ...
    def update_evaluation(self, eval_id: str, data: dict) -> None: ...

class RuntimeLogRepository(Protocol):
    def log_heartbeat(self, runtime_id: str, timestamp: str) -> None: ...
    def log_order(self, order: dict) -> None: ...
    def log_error(self, error: dict) -> None: ...
```

### Implementazioni

**Struttura file consigliata:**

```
engine/
├── repositories/
│   ├── __init__.py
│   ├── base.py                  — Protocol definitions (vedi sopra)
│   ├── supabase_repository.py   — Implementazione Supabase (progetto attuale)
│   ├── sqlite_repository.py     — Implementazione SQLite (fork locale MVP)
│   └── postgres_repository.py   — Implementazione PostgreSQL locale (fork produzione)
```

**SupabaseRepository** (per progetto attuale — nessuna modifica comportamento):
```python
# engine/repositories/supabase_repository.py
class SupabaseSignalRepository:
    def __init__(self, client):
        self._client = client  # supabase-py client
    
    def save_signal(self, signal: dict) -> str:
        result = self._client.table('signals').insert(signal).execute()
        return result.data[0]['id']
    
    def get_latest_signal(self, ticker: str) -> dict | None:
        result = (self._client.table('signals')
                  .select('*')
                  .eq('ticker', ticker)
                  .order('created_at', desc=True)
                  .limit(1)
                  .execute())
        return result.data[0] if result.data else None
```

**SQLiteRepository** (per fork locale MVP):
```python
# engine/repositories/sqlite_repository.py
import sqlite3, json
from datetime import datetime

class SQLiteSignalRepository:
    def __init__(self, db_path: str):
        self._db_path = db_path
    
    def _conn(self):
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    
    def save_signal(self, signal: dict) -> str:
        with self._conn() as conn:
            cursor = conn.execute(
                "INSERT INTO signals (ticker, signal_type, confidence, ...) VALUES (?, ?, ?, ...)",
                (signal['ticker'], signal['signal_type'], signal['confidence'], ...)
            )
            return str(cursor.lastrowid)
```

**Dependency Injection nel runtime:**

```python
# main_daemon.py
import os
from dotenv import load_dotenv

load_dotenv('.env.local')

DB_BACKEND = os.getenv('DB_BACKEND', 'supabase')  # 'supabase' | 'sqlite' | 'postgres'

if DB_BACKEND == 'supabase':
    from supabase import create_client
    client = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_KEY'))
    from engine.repositories.supabase_repository import (
        SupabaseSignalRepository as SignalRepo,
        SupabasePositionRepository as PositionRepo,
        ...
    )
elif DB_BACKEND == 'sqlite':
    from engine.repositories.sqlite_repository import (
        SQLiteSignalRepository as SignalRepo,
        SQLitePositionRepository as PositionRepo,
        ...
    )
elif DB_BACKEND == 'postgres':
    import psycopg2
    from engine.repositories.postgres_repository import (
        PostgresSignalRepository as SignalRepo,
        PostgresPositionRepository as PositionRepo,
        ...
    )

signal_repo = SignalRepo(...)
position_repo = PositionRepo(...)
```

**Nota:** non implementare questo ora. Il refactor va fatto nel fork separato, non nel
progetto attuale.

---

## 7. Broker Abstraction

### Il problema attuale

`engine/executor.py` usa `AlpacaBroker` direttamente:
```python
broker = AlpacaBroker(paper=paper)
```
Non esiste un'interfaccia astratta. Aggiungere MT5 richiede refactor dell'executor.

### BrokerAdapter Protocol

```python
# engine/brokers/broker_adapter.py
from typing import Protocol

class BrokerAdapter(Protocol):
    """Interfaccia minima comune a tutti i broker."""
    
    def get_account(self) -> dict:
        """Equity, buying power, cash, margin."""
        ...
    
    def get_positions(self) -> list[dict]:
        """Posizioni aperte. Normalizzate: ticker, qty, side, entry_price, unrealized_pnl."""
        ...
    
    def get_position(self, ticker: str) -> dict | None:
        """Posizione singola. None se non esiste."""
        ...
    
    def get_latest_price(self, ticker: str) -> float | None:
        """Prezzo live dal feed nativo del broker."""
        ...
    
    def submit_order(
        self,
        ticker: str,
        qty: float,
        side: str,  # 'buy' | 'sell'
        order_type: str,  # 'market' | 'limit'
        stop_loss: float | None = None,
        take_profit: float | None = None,
        time_in_force: str = 'day',
    ) -> dict:
        """Invia ordine. Restituisce order_id + status."""
        ...
    
    def close_position(self, ticker: str) -> dict | None:
        """Chiude posizione aperta al mercato."""
        ...
    
    def set_sl_tp(self, ticker: str, stop_loss: float, take_profit: float) -> bool:
        """Modifica SL/TP su posizione esistente. True se successo."""
        ...
    
    def verify_protection(self, ticker: str) -> dict:
        """Verifica che SL/TP siano presenti lato broker.
        Restituisce: {'has_sl': bool, 'has_tp': bool, 'sl_price': float, 'tp_price': float}"""
        ...
    
    def get_order_status(self, order_id: str) -> dict:
        """Status ordine: pending/filled/cancelled/rejected."""
        ...
```

### Implementazioni

**AlpacaBrokerAdapter** (wrap del `AlpacaBroker` esistente):
```
engine/brokers/alpaca_adapter.py
Wrappa engine/broker_alpaca.py esistente.
Traduce l'API Alpaca nell'interfaccia Protocol.
Nessun refactor del codice AlpacaBroker — solo wrapper.
```

**MetaTraderBrokerAdapter** (nuovo per fork locale):
```
engine/brokers/mt5_adapter.py
Usa MetaTrader5 package Python.
mt5.order_send() per ordini.
mt5.positions_get() per posizioni.
mt5.symbol_info_tick() per prezzi live.
Gestione lot sizing (diverso da qty Alpaca).
```

**PaperLocalBrokerAdapter** (simulazione senza broker reale):
```
engine/brokers/paper_local_adapter.py
Simula ordini in memoria / DB locale.
Per test dry-run senza connessione broker.
P&L simulato con prezzi yfinance.
```

### Metodo `verify_protection()` — priorità alta

Prima di ogni chiusura di step di esecuzione, il daemon chiama `verify_protection()`:
- Se `has_sl=False` o `has_tp=False`: alert Telegram immediato + blocco nuovi trade
- Questo è non negoziabile prima di FTMO

---

## 8. Market Data Routing

### Il problema

Oggi il position manager usa `broker.get_latest_price()` che per Alpaca chiama
Alpaca Market Data. Corretto. Ma se aggiungiamo MT5, quella stessa funzione chiamerebbe
ancora Alpaca per posizioni MT5 — sbagliato.

### MarketDataRouter

```python
# engine/market_data/router.py
from typing import Protocol

class MarketDataAdapter(Protocol):
    def get_price(self, ticker: str) -> float | None: ...
    def get_ohlcv(self, ticker: str, period: str) -> dict | None: ...

class MarketDataRouter:
    def __init__(self):
        self._adapters: dict[str, MarketDataAdapter] = {}
        self._fallback: MarketDataAdapter = YahooFinanceAdapter()
    
    def register(self, broker_name: str, adapter: MarketDataAdapter):
        self._adapters[broker_name] = adapter
    
    def get_price(self, ticker: str, broker: str) -> float | None:
        adapter = self._adapters.get(broker, self._fallback)
        price = adapter.get_price(ticker)
        if price is None and adapter is not self._fallback:
            # Fallback a yfinance se fonte nativa fallisce
            price = self._fallback.get_price(ticker)
        return price
```

**Adapters:**

| Adapter | Fonte | Usato per |
|---------|-------|-----------|
| `AlpacaMarketDataAdapter` | Alpaca Market Data API | Posizioni Alpaca (stocks, crypto) |
| `MT5MarketDataAdapter` | `mt5.symbol_info_tick()` | Posizioni MT5/FTMO (forex, indici) |
| `YahooFinanceAdapter` | yfinance | Fallback, analisi storica, ML training |

**Regole di routing:**

```
Broker = alpaca  → AlpacaMarketDataAdapter (primario) → YahooFinanceAdapter (fallback)
Broker = mt5     → MT5MarketDataAdapter (primario) → YahooFinanceAdapter (fallback solo batch)
Broker = paper   → YahooFinanceAdapter (unico)
```

**Note critiche:**
- MT5MarketDataAdapter funziona solo se il terminale MT5 è aperto e connesso
- Se MT5 disconnesso: blocca nuovi trade, non fallire in silenzio su yfinance
- yfinance ha ritardo 15-20 minuti per dati live — mai usarlo per decisioni su posizioni aperte

---

## 9. MT5 / FTMO Integration Plan

### Requisiti di sistema

| Requisito | Dettaglio |
|-----------|-----------|
| Sistema operativo | Windows 10/11 o Windows Server 2019+ |
| MetaTrader 5 | Terminale installato, loggato al broker, sessione attiva |
| Python package | `MetaTrader5` (pip install MetaTrader5) — solo Windows |
| Processo persistente | Il terminale MT5 deve rimanere aperto H24 |
| Connessione internet | Stabile — disconnessione causa perdita dati tick |
| Account broker | FTMO (prop) o broker MT5 standard (Pepperstone, ICMarkets) |

### Perché serve runtime persistente

Il package `MetaTrader5` comunica col terminale MT5 tramite IPC locale (named pipe / shared memory).
Se il terminale si chiude, `mt5.initialize()` fallisce e nessuna operazione è possibile.
A differenza di Alpaca (HTTP REST — stateless), MT5 richiede che il processo terminale sia vivo.

GitHub Actions non può:
1. Installare MetaTrader5 su runner Ubuntu
2. Mantenere una sessione Windows persistente tra run
3. Fare login al broker MT5 in modo sicuro in 30 secondi

### Python MT5 Bridge vs EA MQL5

| Aspetto | Python MT5 Bridge | EA MQL5 |
|---------|------------------|---------|
| Linguaggio | Python — stesso stack del progetto | MQL5 — linguaggio proprietario |
| Integrazione repo | Naturale — riusa agents, scoring, Supabase/DB | Separato — logica duplicata in MQL5 |
| Flessibilità | Alta — accedi a tutto il Python ecosystem | Limitata al runtime MT5 |
| Debugging | Standard Python debugging | Editor MetaEditor (limitato) |
| Stabilità | Dipende da IPC → più fragile | Gira dentro MT5 → più stabile |
| Raccomandazione | **Per CreativityLand** — fase di sviluppo | Per produzione avanzata futura |

**Per CreativityLand:** Python bridge è la scelta corretta. Il codice agenti, scoring, risk
management rimane in Python. Il bridge è solo uno strato di comunicazione con MT5.

### MT5 Bridge — struttura

```python
# engine/brokers/mt5_bridge.py
import MetaTrader5 as mt5
import time
import logging

logger = logging.getLogger('mt5_bridge')

class MT5Bridge:
    def __init__(self, login: int, password: str, server: str):
        self._login = login
        self._password = password
        self._server = server
        self._connected = False
    
    def initialize(self) -> bool:
        """Inizializza connessione al terminale MT5."""
        if not mt5.initialize():
            logger.error(f"MT5 initialize failed: {mt5.last_error()}")
            return False
        
        if not mt5.login(self._login, self._password, self._server):
            logger.error(f"MT5 login failed: {mt5.last_error()}")
            mt5.shutdown()
            return False
        
        self._connected = True
        logger.info(f"MT5 connected: {mt5.account_info().login}")
        return True
    
    def ensure_connected(self) -> bool:
        """Reconnect con backoff esponenziale se disconnesso."""
        if self._connected and mt5.account_info() is not None:
            return True
        
        for attempt, wait in enumerate([5, 10, 30, 60, 120], 1):
            logger.warning(f"MT5 reconnect attempt {attempt}...")
            if self.initialize():
                return True
            time.sleep(wait)
        
        logger.critical("MT5 reconnect failed after 5 attempts. Alerting.")
        return False
    
    def get_tick(self, symbol: str) -> dict | None:
        """Prezzo bid/ask corrente."""
        if not self.ensure_connected():
            return None
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            return None
        return {'bid': tick.bid, 'ask': tick.ask, 'time': tick.time}
    
    def get_positions(self) -> list[dict]:
        """Posizioni aperte."""
        if not self.ensure_connected():
            return []
        positions = mt5.positions_get()
        if positions is None:
            return []
        return [self._normalize_position(p) for p in positions]
    
    def submit_order(self, symbol: str, lots: float, order_type: int,
                     sl: float, tp: float, comment: str = '') -> dict:
        """Invia ordine di mercato con SL/TP."""
        if not self.ensure_connected():
            raise ConnectionError("MT5 not connected")
        
        tick = mt5.symbol_info_tick(symbol)
        if tick is None:
            raise ValueError(f"No tick data for {symbol}")
        
        price = tick.ask if order_type == mt5.ORDER_TYPE_BUY else tick.bid
        
        request = {
            'action': mt5.TRADE_ACTION_DEAL,
            'symbol': symbol,
            'volume': lots,
            'type': order_type,
            'price': price,
            'sl': sl,
            'tp': tp,
            'deviation': 10,
            'magic': 20260101,
            'comment': comment,
            'type_time': mt5.ORDER_TIME_GTC,
            'type_filling': mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"Order failed: {result.comment} (code {result.retcode})")
        
        return {
            'order_id': result.order,
            'deal_id': result.deal,
            'volume': result.volume,
            'price': result.price,
        }
```

### Lot Sizing — differenza critica vs Alpaca

Alpaca usa `qty` (numero di azioni o frazione). MT5 usa `lots` (unità contrattuali).

```python
# engine/brokers/mt5_sizing.py

def calculate_lots(
    account_equity: float,
    risk_pct: float,          # es. 0.01 = 1% del conto
    entry_price: float,
    stop_loss_price: float,
    symbol: str,
    tick_value: float,        # valore monetario di 1 tick
    tick_size: float,         # dimensione minima movimento prezzo
    contract_size: float,     # unità per 1 lot (es. 100.000 per forex)
    min_lot: float = 0.01,
    lot_step: float = 0.01,
) -> float:
    """
    Calcola lot size basato su rischio percentuale.
    
    Esempio EURUSD:
    - risk_$ = 100 (1% di $10.000)
    - SL distance = 20 pip = 0.0020
    - tick_value = $10 per pip per 1 lot
    - pip_distance = 20
    - lots = risk_$ / (pip_distance * pip_value) = 100 / (20 * 10) = 0.5 lots
    """
    risk_dollars = account_equity * risk_pct
    sl_distance = abs(entry_price - stop_loss_price)
    
    if sl_distance < tick_size:
        raise ValueError(f"SL troppo vicino: {sl_distance} < {tick_size}")
    
    pip_distance = sl_distance / tick_size
    pip_value = tick_value  # per 1 lot
    
    lots_raw = risk_dollars / (pip_distance * pip_value)
    
    # Arrotonda al lot step più vicino verso il basso
    lots = max(min_lot, round(lots_raw // lot_step * lot_step, 2))
    
    return lots
```

### Risk Rules FTMO — da monitorare in tempo reale

Queste regole sono non negoziabili. Violarne una causa squalifica immediata dalla challenge.

| Regola FTMO | Soglia tipica | Frequenza controllo | Azione se violata |
|-------------|--------------|--------------------|--------------------|
| **Max Daily Loss** | -5% del balance iniziale del giorno | Ogni check position manager | Stop immediato nuovi trade + alert |
| **Max Total Drawdown** | -10% dal balance iniziale account | Ogni check | Emergency close tutto + alert |
| **Min Trading Days** | 10 giorni con almeno 1 trade in 30 | Fine sessione | Avviso se a rischio |
| **Max Risk per Trade** | ~1-2% (non regola FTMO ma best practice) | Pre-order | Skip se lot size > limite |
| **No Trade se info non leggibili** | — | Pre-order | Skip + log se account_info() None |
| **SL/TP obbligatori** | — | Post-order | Verifica immediata, alert se assenti |
| **No averaging down** | — | Pre-order | Skip se posizione stessa direzione già aperta |

**Implementazione RiskManagerFTMO:**

```python
# engine/risk/risk_manager_ftmo.py

class RiskManagerFTMO:
    def __init__(self, broker: BrokerAdapter, repo: PositionRepository,
                 max_daily_loss_pct: float = 0.05,
                 max_total_drawdown_pct: float = 0.10,
                 max_risk_per_trade_pct: float = 0.01):
        self._broker = broker
        self._repo = repo
        self._max_daily_loss = max_daily_loss_pct
        self._max_drawdown = max_total_drawdown_pct
        self._max_risk_trade = max_risk_per_trade_pct
        self._daily_start_balance: float | None = None
        self._initial_balance: float | None = None
    
    def check_can_trade(self) -> tuple[bool, str]:
        """Returns (can_trade, reason)."""
        account = self._broker.get_account()
        if account is None:
            return False, "Account info non disponibile — skip preventivo"
        
        equity = float(account.get('equity', 0))
        balance = float(account.get('balance', equity))
        
        # Inizializza balance del giorno
        if self._daily_start_balance is None:
            self._daily_start_balance = balance
        if self._initial_balance is None:
            self._initial_balance = balance
        
        # Check daily loss
        daily_loss_pct = (balance - self._daily_start_balance) / self._daily_start_balance
        if daily_loss_pct <= -self._max_daily_loss:
            return False, f"Daily loss limit raggiunto: {daily_loss_pct:.2%}"
        
        # Check max drawdown
        total_dd_pct = (equity - self._initial_balance) / self._initial_balance
        if total_dd_pct <= -self._max_drawdown:
            return False, f"Max drawdown raggiunto: {total_dd_pct:.2%} — EMERGENCY CLOSE"
        
        return True, "OK"
    
    def reset_daily_balance(self):
        """Chiamare all'inizio di ogni sessione di trading."""
        account = self._broker.get_account()
        if account:
            self._daily_start_balance = float(account.get('balance', 0))
```

---

## 10. Scheduler locale

### Confronto

| Scheduler | Setup | Affidabilità | Visibilità | Restart auto | Raccomandato per |
|-----------|-------|-------------|-----------|--------------|-----------------|
| **Windows Task Scheduler** | Nativo Windows, GUI | Alta (OS-managed) | Log eventi Windows | No (aggiungere watchdog) | MVP locale |
| **NSSM** (Non-Sucking Service Manager) | 1 comando install | Alta (Windows Service) | Logs file | Sì (SC failure action) | Produzione locale |
| **Python APScheduler** | `pip install apscheduler` | Media (dipende dal processo) | Logging Python | No (dentro il daemon) | Integrazione nel daemon |
| **Docker Compose** | Docker Desktop necessario | Alta | Docker logs | Sì (restart policy) | Se già usi Docker |

### Raccomandazione per fase

**MVP locale (Fase 1-3):** Windows Task Scheduler
```xml
<!-- Trigger: ogni 20 minuti -->
<Triggers>
  <TimeTrigger>
    <Repetition>
      <Interval>PT20M</Interval>
      <Duration>P1D</Duration>
    </Repetition>
    <StartBoundary>2026-01-01T08:00:00</StartBoundary>
  </TimeTrigger>
  <BootTrigger/>  <!-- Avvio anche al riavvio del PC -->
</Triggers>
```

Task da creare:
- `CreativityLand_Pipeline` — ogni 2h (scrape, agenti, execute)
- `CreativityLand_PositionManager` — ogni 20 min
- `CreativityLand_Heartbeat` — ogni 5 min
- `CreativityLand_Watchdog` — ogni 5 min
- `CreativityLand_Retrain` — domenica 03:00 locale

**Produzione locale (Fase 4+):** NSSM
```cmd
# Installa daemon come servizio Windows
nssm install CreativityLandDaemon "C:\CreativityLand\venv\Scripts\python.exe"
nssm set CreativityLandDaemon AppParameters "C:\CreativityLand\main_daemon.py"
nssm set CreativityLandDaemon AppDirectory "C:\CreativityLand"
nssm set CreativityLandDaemon AppEnvironmentExtra "PYTHONPATH=C:\CreativityLand"
nssm set CreativityLandDaemon AppStdout "C:\CreativityLand\logs\daemon.log"
nssm set CreativityLandDaemon AppStderr "C:\CreativityLand\logs\daemon_err.log"
nssm set CreativityLandDaemon Start SERVICE_AUTO_START
nssm set CreativityLandDaemon ObjectName ".\trading_user" "password_qui"
nssm set CreativityLandDaemon AppRestartDelay 5000  # 5s restart su crash

sc failure CreativityLandDaemon reset= 86400 actions= restart/5000/restart/10000/restart/30000
```

**MT5/FTMO (Fase 7+):** NSSM per daemon + Task Scheduler per MT5 auto-login
```cmd
# MT5 avvio automatico all'accensione
# Task Scheduler → trigger: All'accensione
# Azione: avvia MetaTrader5.exe con argomenti login
```

---

## 11. Dashboard locale

### Strategia

La dashboard Next.js esistente funziona già in locale con `npm run dev` o `npm run start`.
Il problema è riconfigurare le API routes per usare il DB locale invece di Supabase.

### Configurazione

```
# dashboard/.env.local (fork locale)
NEXT_PUBLIC_DB_BACKEND=local
LOCAL_DB_URL=postgresql://localhost:5432/creativityland
# oppure per SQLite:
# LOCAL_DB_PATH=C:/CreativityLand/database.db

# Rimuovere o lasciar vuoto:
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Architettura API routes locali

```typescript
// dashboard/src/lib/db-local.ts  (nuovo file per fork)
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.LOCAL_DB_URL,
})

export async function query(sql: string, params?: any[]) {
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}
```

```typescript
// dashboard/src/app/api/signals/route.ts (adattato per fork)
import { query } from '@/lib/db-local'

export async function GET() {
  const result = await query(
    `SELECT * FROM signals ORDER BY created_at DESC LIMIT 50`
  )
  return Response.json(result.rows)
}
```

### Accesso remoto sicuro

**Non esporre porte sul router.** Usa Tailscale VPN:

```
1. Installa Tailscale su PC Windows (gratis fino a 3 device)
2. Installa Tailscale su PC/telefono da cui vuoi accedere
3. Dashboard accessibile via http://[tailscale-ip]:3000
4. Nessuna porta aperta, nessun tunnel, crittografia E2E
```

Alternativa: **VS Code Remote + port forwarding** — forwarda localhost:3000 sul tuo PC remoto.

### Heartbeat nella dashboard

Aggiungere pagina `/health` che mostra:
- Timestamp ultimo heartbeat dal daemon
- Status MT5 (connesso/disconnesso)
- Status DB locale
- Posizioni aperte
- Risk metrics (daily loss, drawdown)
- Log ultimi 20 eventi

---

## 12. Secrets e sicurezza

### Regole

| Regola | Dettaglio |
|--------|-----------|
| Mai nel repo | `.env.local` in `.gitignore` — sempre |
| Permessi file | `icacls .env.local /inheritance:r /grant:r "%USERNAME%:R"` (solo utente corrente) |
| Windows Credential Manager | Opzionale: secrets critici (FTMO password, Telegram token) in Credential Store |
| Backup cifrato | `gpg -c .env.local` — output `.env.local.gpg` su USB o NAS |
| Account dedicato | Utente Windows `trading_user` separato dall'account personale |
| Firewall | Windows Firewall attivo. Nessuna regola in ingresso non necessaria |
| Tailscale | Solo accesso remoto via VPN — nessuna porta esposta |
| MT5 credenziali | Solo in `.env.local` — mai nel codice |
| Antivirus | Eccezione sulla cartella `C:\CreativityLand\` per evitare false positivi su codice Python |

### Account Windows dedicato

```
Utente: trading_user
Tipo: Standard (non Admin)
Password: forte, memorizzata in password manager
Auto-login: NO — avvio manuale o Task Scheduler come servizio
Sessione: può essere bloccata, i servizi girano come background
```

### `.env.local` — struttura

```bash
# .env.local (non committare mai)

# Database
DB_BACKEND=sqlite          # sqlite | postgres | supabase
LOCAL_DB_PATH=C:/CreativityLand/database.db
# oppure: LOCAL_DB_URL=postgresql://localhost:5432/creativityland

# Broker
ACTIVE_BROKER=mt5          # mt5 | alpaca | paper_local
MT5_LOGIN=12345678
MT5_PASSWORD=your_password
MT5_SERVER=FTMODemo-Server
PAPER_TRADING=true

# Alpaca (solo se ACTIVE_BROKER=alpaca)
ALPACA_API_KEY=
ALPACA_SECRET_KEY=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=

# LLM
OPENROUTER_API_KEY=

# News
NEWS_API_KEY=
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
FRED_API_KEY=

# Risk FTMO
FTMO_MAX_DAILY_LOSS_PCT=0.05
FTMO_MAX_DRAWDOWN_PCT=0.10
FTMO_INITIAL_BALANCE=10000

# Runtime
RUNTIME_ID=windows_local_01
LOG_DIR=C:/CreativityLand/logs
```

---

## 13. Watchdog e affidabilità

### Requisiti minimi

```python
# engine/watchdog/watchdog.py

import time
import subprocess
import logging
from datetime import datetime, timedelta
from engine.brokers.mt5_bridge import MT5Bridge
from engine.repositories.base import RuntimeLogRepository
from bot_telegram.telegram_notifier import notify

logger = logging.getLogger('watchdog')

class Watchdog:
    def __init__(
        self,
        repo: RuntimeLogRepository,
        mt5_bridge: MT5Bridge | None,
        heartbeat_timeout_minutes: int = 15,
        check_interval_seconds: int = 300,  # 5 min
    ):
        self._repo = repo
        self._mt5 = mt5_bridge
        self._timeout = heartbeat_timeout_minutes
        self._interval = check_interval_seconds
    
    def run(self):
        logger.info("Watchdog started")
        while True:
            try:
                self._check_heartbeat()
                self._check_db()
                if self._mt5:
                    self._check_mt5()
                self._check_kill_switch()
            except Exception as e:
                logger.error(f"Watchdog check failed: {e}")
            time.sleep(self._interval)
    
    def _check_heartbeat(self):
        """Controlla se il daemon ha scritto heartbeat recentemente."""
        last = self._repo.get_last_heartbeat()
        if last is None:
            notify("⚠️ WATCHDOG: nessun heartbeat trovato nel DB")
            return
        
        age = datetime.utcnow() - last
        if age > timedelta(minutes=self._timeout):
            notify(f"🚨 WATCHDOG: heartbeat assente da {age.total_seconds()/60:.0f} min")
            self._attempt_daemon_restart()
    
    def _check_mt5(self):
        """Verifica che MT5 sia connesso."""
        import MetaTrader5 as mt5
        if mt5.account_info() is None:
            logger.warning("MT5 disconnected — attempting reconnect")
            notify("⚠️ MT5 disconnesso — tentativo reconnect")
            self._mt5.ensure_connected()
    
    def _check_db(self):
        """Verifica che il DB locale sia raggiungibile."""
        try:
            self._repo.get_last_heartbeat()  # query di test
        except Exception as e:
            notify(f"🚨 DB locale non raggiungibile: {e}")
    
    def _check_kill_switch(self):
        """Legge flag kill switch dal DB locale."""
        kill = self._repo.get_kill_switch_flag()
        if kill:
            notify("🛑 Kill switch attivato — arresto daemon")
            raise SystemExit("Kill switch")
    
    def _attempt_daemon_restart(self):
        """Tenta riavvio daemon via Task Scheduler o NSSM."""
        try:
            subprocess.run(['sc', 'stop', 'CreativityLandDaemon'], check=True, timeout=10)
            time.sleep(5)
            subprocess.run(['sc', 'start', 'CreativityLandDaemon'], check=True, timeout=10)
            notify("ℹ️ Daemon riavviato dal watchdog")
        except Exception as e:
            notify(f"🚨 Riavvio daemon fallito: {e}")
```

### Checklist affidabilità

- [ ] Heartbeat ogni 5 min nel DB locale
- [ ] Alert Telegram se heartbeat assente >15 min
- [ ] Watchdog verifica MT5 connesso ogni 5 min
- [ ] Watchdog verifica DB locale ogni 5 min
- [ ] Kill switch flag nel DB — leggibile da Telegram bot
- [ ] Log rotation: 30 giorni, file per componente
- [ ] Auto-restart via NSSM failure action
- [ ] Test reboot: PC spento e riacceso, daemon riparte da solo <2 min
- [ ] Test disconnessione: Ethernet staccato, daemon aspetta e non crasha
- [ ] Test MT5 crash: terminale chiuso, watchdog riavvia e avvisa
- [ ] Backup DB giornaliero automatico

---

## 14. Strategia di migrazione in fasi

### Fase 0 — Fork/branch local-first

**Obiettivo:** preparare l'ambiente senza toccare il progetto principale.

**Azioni:**
- Creare branch `local-first` nel repo esistente (o fork separato `creativityland-local`)
- Congelare il progetto cloud (nessuna modifica a `main` durante le fasi iniziali)
- Creare struttura directory `local_runtime/` o fork dedicato
- Copiare `.env` in `.env.local` e adattare variabili

**File coinvolti:** solo creazione nuovi file, nessun file esistente modificato

**Rischio:** nessuno — nessun codice produttivo toccato

**Criterio di successo:** branch/fork creato, ambiente Python locale funzionante

**Rollback:** delete branch — nessun impatto su main

---

### Fase 1 — Local DB read-only

**Obiettivo:** importare schema e dati di esempio in DB locale. Script legge localmente.

**Azioni:**
- Creare schema SQLite basato su DDL Supabase (adattato, senza pgvector)
- Script di import dati di esempio da Supabase via pg_dump o export CSV
- Script di test che legge dal DB locale (solo SELECT, no write)

**File coinvolti:**
- `scripts/create_local_schema.sql`
- `scripts/import_from_supabase.py`
- `scripts/test_local_read.py`

**Rischio:** basso — nessun ordine, nessuna scrittura

**Criterio di successo:** dati leggibili localmente, query funzionano

**Rollback:** delete DB locale

---

### Fase 2 — Data Access Layer

**Obiettivo:** astrarre Supabase nei repository. Codice agnostico dal backend.

**Azioni:**
- Implementare `SignalRepository`, `PositionRepository`, `ArticleRepository` (Protocol)
- Implementare `SQLiteSignalRepository`, `SQLitePositionRepository`
- Test unitari per ogni repository
- Configurazione via `DB_BACKEND` env var

**File coinvolti:**
- `engine/repositories/base.py` (nuovo)
- `engine/repositories/supabase_repository.py` (nuovo — wrappa codice esistente)
- `engine/repositories/sqlite_repository.py` (nuovo)
- Test in `tests/test_repositories.py`

**Rischio:** medio — refactor del codice agenti ma nessun side effect in produzione
se il branch è separato

**Criterio di successo:** tutti i test repository passano su entrambi i backend

**Rollback:** non mergiare in main

---

### Fase 3 — Local scheduler dry-run

**Obiettivo:** pipeline gira in locale ogni 2h, produce log e segnali nel DB locale. Nessun ordine.

**Azioni:**
- Creare `pipeline_runner.py` che esegue tutti i step (senza `execute_signal`)
- Configurare Task Scheduler Windows con trigger ogni 2h
- Verificare che tutti i dati vengano scritti nel DB locale
- `TRADING_ENABLED=false` obbligatorio

**File coinvolti:**
- `local_runtime/pipeline_runner.py` (nuovo)
- Task Scheduler (configurazione manuale)

**Rischio:** basso — nessun ordine inviato a broker

**Criterio di successo:** pipeline completa gira autonomamente per 1 settimana senza crash.
DB locale contiene segnali, articoli, scoring.

**Rollback:** spegni Task Scheduler task

---

### Fase 4 — Local dashboard

**Obiettivo:** Next.js punta al DB locale. Dashboard visibile su localhost.

**Azioni:**
- Aggiungere `dashboard/src/lib/db-local.ts`
- Adattare API routes per usare DB locale via variabile d'ambiente
- Configurare Tailscale per accesso remoto
- Verificare che tutte le pagine funzionino

**File coinvolti:**
- `dashboard/src/lib/db-local.ts` (nuovo)
- `dashboard/.env.local` (adattato)
- API routes adattate

**Rischio:** medio — refactor dashboard, potenziali regression su pagine

**Criterio di successo:** tutte le pagine dashboard funzionano con dati DB locale

**Rollback:** revert API routes, rimetti Supabase config

---

### Fase 5 — Local Position Manager

**Obiettivo:** position manager gira localmente ogni 20 min. Solo log, nessuna modifica ordini.

**Azioni:**
- Creare `local_runtime/position_manager_local.py`
- Configurare Task Scheduler ogni 20 min
- Modalità read-only: legge posizioni, logga, NON modifica SL/TP, NON chiude posizioni
- Verifica che output coincida con position_manager.yml di GitHub Actions

**File coinvolti:**
- `local_runtime/position_manager_local.py` (nuovo)

**Rischio:** basso — solo lettura

**Criterio di successo:** output position manager locale = output GitHub Actions per 2 settimane

**Rollback:** spegni task scheduler

---

### Fase 6 — BrokerAdapter

**Obiettivo:** separare Alpaca/MT5/PaperLocal. Executor usa Protocol astratto.

**Azioni:**
- Implementare `BrokerAdapter` Protocol
- `AlpacaBrokerAdapter` (wrappa `AlpacaBroker` esistente)
- `PaperLocalBrokerAdapter` (simulazione locale)
- Adattare `executor.py` per ricevere adapter via DI
- Test con `PaperLocalBrokerAdapter`

**File coinvolti:**
- `engine/brokers/broker_adapter.py` (nuovo)
- `engine/brokers/alpaca_adapter.py` (nuovo)
- `engine/brokers/paper_local_adapter.py` (nuovo)
- `engine/executor.py` (refactor per DI)

**Rischio:** medio — refactor executor, pre-flight checks vanno testati

**Criterio di successo:** executor funziona con tutti e 3 gli adapter. Test passano.

**Rollback:** non mergiare in main

---

### Fase 7 — MT5 read-only

**Obiettivo:** leggere account, posizioni, prezzi da MT5. Nessun ordine.

**Azioni:**
- Installare MetaTrader5 Python package
- Creare `engine/brokers/mt5_bridge.py`
- Test connessione + login su conto demo
- Leggere `mt5.positions_get()`, `mt5.account_info()`, `mt5.symbol_info_tick()`
- `MT5MarketDataAdapter` legge prezzi per confronto con yfinance

**File coinvolti:**
- `engine/brokers/mt5_bridge.py` (nuovo)
- `engine/market_data/mt5_adapter.py` (nuovo)
- `scripts/test_mt5_connection.py` (nuovo)

**Rischio:** basso — solo lettura, conto demo

**Criterio di successo:** dati MT5 letti correttamente. Nessun errore di connessione in 48h.

**Rollback:** uninstall MetaTrader5 package

---

### Fase 8 — MT5 demo execution

**Obiettivo:** ordini reali su conto demo MT5. Micro-lotti. SL/TP verificati.

**Azioni:**
- `MetaTraderBrokerAdapter` completo con `submit_order()`
- `calculate_lots()` per sizing corretto
- Test con micro-lotti (0.01 lot) su conto demo FTMO
- `verify_protection()` obbligatorio dopo ogni ordine
- `RiskManagerFTMO` attivo
- Watchdog + heartbeat attivi

**File coinvolti:**
- `engine/brokers/mt5_adapter.py` (completo)
- `engine/brokers/mt5_sizing.py` (nuovo)
- `engine/risk/risk_manager_ftmo.py` (nuovo)

**Rischio:** medio — ordini reali su conto demo. Capital a rischio: nessuno (demo).

**Criterio di successo:** 20+ trade demo aperti/chiusi correttamente. SL/TP sempre presenti.
FTMO risk rules mai violate. Sistema stabile per 2 settimane.

**Rollback:** `TRADING_ENABLED=false`

---

### Fase 9 — FTMO Free Trial

**Obiettivo:** account FTMO Free Trial con regole reali, capitale virtuale ma metriche reali.

**Prerequisiti obbligatori:**
- Fase 8 stabile per ≥2 settimane senza interventi manuali
- RiskManagerFTMO testato e verificato
- Watchdog operativo H24
- VPS Windows (non portatile personale)
- Backup automatico giornaliero attivo
- `verify_protection()` verificato su 20+ trade

**Rischio:** medio-alto — violazione regole FTMO causa fine account

**Criterio di successo:** Free Trial completato senza violare daily loss / max drawdown.
Min 10 trading days raggiunti.

**Rollback:** chiudere account FTMO Free Trial

---

### Fase 10 — FTMO Challenge

**Obiettivo:** prop firm capital. Solo dopo stabilità comprovata.

**Prerequisiti:**
- Fase 9 completata con successo
- Track record positivo o breakeven su Free Trial
- VPS Windows con uptime >99% nelle ultime 4 settimane
- Nessuna violazione risk rules nelle ultime 4 settimane
- Kill switch testato: funziona in <30 secondi
- Daily backup verificato: restore testato

**Rischio:** alto — capitale prop, regole ferree, squalifica possibile

**Criterio di successo:** Challenge completata. Funded account attivato.

---

## 15. Cosa NON fare

Lista concreta di errori con conseguenze reali:

| Errore | Conseguenza | Alternativa |
|--------|-------------|-------------|
| Migrare tutto in un colpo | Sistema instabile, debugging impossibile | Seguire le fasi una alla volta |
| Aprire trade senza SL/TP verificati | Drawdown illimitato su posizioni senza protezione | `verify_protection()` obbligatorio dopo ogni ordine |
| Tenere DB solo locale senza backup | Perdita totale storia trade su crash disco | Backup giornaliero automatico + copia off-site |
| GitHub Actions E locale entrambi attivi per execution | Ordini doppi, posizioni doppie, P&L sbagliato | Un solo runtime comanda ogni broker — mai entrambi |
| Usare yfinance per decisioni live | Prezzo sbagliato (ritardo 15-20 min) → stop wrong level | `broker.get_latest_price()` sempre per posizioni live |
| Esporre dashboard su internet senza VPN | Accesso non autorizzato al sistema, leakage secrets | Solo Tailscale / VPN privata |
| Secrets nel repo | API key compromesse, account broker rubati | `.env.local` + gitignore + backup cifrato |
| Partire da FTMO Challenge senza Free Trial | Squalifica immediata, perdita fee Challenge (€150-300) | Free Trial prima, sempre |
| Ignorare daily loss limit FTMO | Squalifica account FTMO | RiskManagerFTMO con hard stop |
| Usare PC personale per FTMO Challenge | Riavvio improvviso, posizioni incustodite → squalifica | VPS Windows dedicato |
| Non testare reboot prima di live | Daemon non riparte, posizioni senza sorveglianza ore | Test reboot obbligatorio in Fase 0-1 |
| Averaging down su posizione perdente | Violazione regole FTMO + loss amplificata | Blocco tecnico su 2° posizione stessa direzione |

---

## 16. Roadmap del fork local-first

> Questa roadmap è **separata e indipendente** dalla roadmap del progetto cloud-first.
> Il progetto cloud (GitHub Actions + Supabase + Alpaca) continua invariato.

```
Q2 2026 (Aprile - Giugno)
├─ Fase 0: Preparazione fork/branch (1-2 giorni)
├─ Fase 1: Local DB read-only (1 settimana)
├─ Fase 2: Data Access Layer (2-3 settimane)
│   Prerequisito: cloud bot stabile con ≥50 trade chiusi
└─ Fase 3: Local scheduler dry-run (2 settimane)

Q3 2026 (Luglio - Settembre)
├─ Fase 4: Local dashboard (1-2 settimane)
├─ Fase 5: Local Position Manager read-only (2 settimane)
│   Prerequisito: track record cloud ≥3 mesi
├─ Fase 6: BrokerAdapter (1-2 settimane)
└─ Fase 7: MT5 read-only su demo (1 settimana)

Q4 2026 (Ottobre - Dicembre)
├─ Fase 8: MT5 demo execution (3-4 settimane)
│   Prerequisito: VPS Windows pronto
├─ Fase 9: FTMO Free Trial (durata FTMO: 30 giorni)
│   Prerequisito: Fase 8 stabile ≥2 settimane
└─ Valutazione: continuare con Challenge?

2027+
└─ Fase 10: FTMO Challenge (solo se Free Trial positivo)
```

**Regola di avanzamento:** nessuna fase inizia finché la precedente non è stabile per
almeno 2 settimane senza interventi manuali e senza violazioni risk rules.

---

## 17. Raccomandazione finale

### Fork vs Branch

**Consigliato: branch `local-first` nel repo esistente** (per ora).

- Mantieni lo stesso repo — non duplicare tutto il codice subito
- Usa il branch per sviluppare i nuovi componenti (repositories, broker adapters, daemon)
- Quando il fork locale è abbastanza maturo, valuta di separarlo in repo indipendente
- Vantaggio: condividi test, agenti, engine tra i due progetti finché hanno senso comune

**Passa a repo fork separato quando:**
- Il codice locale diverge significativamente (scheduler diverso, DB diverso, dashboard locale)
- Vuoi CI/CD separata per il fork locale (test locali, build Windows)
- Vuoi evitare confusione tra branch `main` (cloud) e branch `local-first`

### DB per MVP

**SQLite** — partenza zero-configurazione. Avrai dati, segnali, posizioni senza installare nulla.
Quando arrivi alla Fase 7 (MT5) e hai bisogno di pgvector per pattern matching,
migra a **PostgreSQL locale** con uno script di import. Non partire da PostgreSQL subito.

### Scheduler per MVP

**Windows Task Scheduler** — nativo, affidabile, zero installazione aggiuntiva.
Quando passi a NSSM per produzione, l'upgrade richiede 10 minuti.

### Quando introdurre MT5

**Non prima di Fase 6** (BrokerAdapter completato).
Non prima che il cloud bot abbia ≥50 trade chiusi con comportamento stabile.
MT5 aggiunge complessità significativa (sizing lots, reconnect, sessione persistente).
Introduce quella complessità solo quando sai che il sistema di analisi funziona.

### Quando eliminare davvero Alpaca

**Mai completamente.** Mantieni `AlpacaBrokerAdapter` come opzione. È utile per:
- Test di regressione senza MT5
- Confronto segnali tra paper Alpaca e live MT5
- Fallback se MT5 non disponibile

Smetti di usare Alpaca come **broker primario di esecuzione** quando MT5 demo execution
è stabile e verificata (Fase 8+).

### Prerequisiti prima di FTMO

Nessuna eccezione a questa lista:

- [ ] Track record paper ≥3 mesi, comportamento prevedibile
- [ ] BrokerAdapter implementato e testato
- [ ] `calculate_lots()` verificato su 50+ trade demo
- [ ] `verify_protection()` funzionante e obbligatorio nel flow
- [ ] `RiskManagerFTMO` testato con violazioni simulate
- [ ] Watchdog H24 stabile su VPS Windows
- [ ] Heartbeat + alert Telegram testati
- [ ] Kill switch testato: funziona in <30 secondi
- [ ] Backup DB verificato: restore testato una volta
- [ ] Test reboot VPS: daemon riparte <2 minuti
- [ ] Test disconnessione internet: daemon aspetta, non crasha
- [ ] Zero violazioni risk rules nelle ultime 4 settimane di demo
- [ ] MT5 Free Trial completato con esito positivo

---

*Documento generato il 2026-04-16. Aggiornare a ogni avanzamento di fase.*  
*Fonte tecnica: analisi `engine/`, `agents/`, `.github/workflows/`, Obsidian vault CreativityLand.*
