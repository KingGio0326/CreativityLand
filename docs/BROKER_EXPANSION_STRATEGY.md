# Strategia di Espansione Broker e Mercati

**Ultima revisione:** 2026-04-07  
**Stato progetto:** Paper trading attivo — Alpaca, budget virtuale $1.000

---

## 1. Scopo del Documento

Questo documento registra le decisioni strategiche relative all'architettura di esecuzione del bot:
quale broker usare, per quale mercato, con quali costi reali su conto piccolo, e in quale ordine
espandere il progetto nel tempo.

**Non è un documento di marketing.** È un riferimento operativo da aggiornare man mano che il
progetto cresce.

---

## 2. Stato Attuale

| Parametro | Valore |
|-----------|--------|
| Broker attivo | Alpaca (paper trading) |
| Budget virtuale | $1.000 USD |
| Ticket medio | ~$37 per posizione (3,75% del capitale) |
| Mercati attivi | Azioni USA + Crypto spot |
| Leva attuale | Nessuna (cash only) |
| Short selling | Supportato (solo azioni USA, non crypto) |
| SL/TP | Gestiti via `position_manager.yml` + bracket Alpaca |
| Frequenza segnali | Ogni 2 ore (bot), ogni ora (position manager) |

Il layer di analisi (19 agenti) è già **broker-agnostico** per design. L'integrazione
broker è isolata in `engine/broker_alpaca.py`. Aggiungere un nuovo broker richiede
un nuovo adapter, non toccare la pipeline.

---

## 3. Mega Tabella — Broker / Mercati / Costi / Integrabilità

> **Nota sui costi:** calcolati su ticket da ~€100 con conto ≤ €2.000. Su ticket piccoli
> spread e slippage pesano più delle commissioni nominali.

| Area | Mercato | Obiettivo | Broker candidato | Priorità | Facilità integrazione | Leva con conto piccolo | Costi tipici su ticket €100 | Costo overnight | Short | Vantaggi principali | Svantaggi principali | Quando sceglierlo | Impatto tecnico previsto |
|------|---------|-----------|-----------------|----------|-----------------------|------------------------|-----------------------------|-----------------|-------|---------------------|----------------------|-------------------|--------------------------|
| **Attuale** | Azioni USA | Continuità, segnali equity | Alpaca | ✅ Attivo | ✅ Già integrato | Nessuna (cash) / 2× RegT (paper) | $0 commissioni; spread ~0,01% | $0 (no CFD) | ✅ (azioni intere) | Zero commissioni, API REST semplice, fractional shares, bracket orders, paper mode | Leva RegT 2× non utile su $1k; solo mercato USA; crypto fee pesanti | Sempre — è il broker di partenza | Nessuno, già pronto |
| **Attuale** | Crypto spot | BTC/ETH/SOL/XRP/DOGE | Alpaca | ✅ Attivo | ✅ Già integrato | Nessuna | ~0,25% per side = ~€0,50 su €100 (1% round-trip) | $0 | ❌ | Stesso broker, stesso codice, stessa API | Fee relativamente alte su tagli piccoli; no leva; TIF solo `gtc` | Già usato — accettabile finché il ticket medio sale | Nessuno; fix TIF già applicato |
| **Prossimo step A** | Forex | EUR/USD, GBP/USD, USD/JPY | OANDA | 🔶 Alta | 🔶 Media (API REST v20 ben documentata) | 10:1 – 50:1 tipico | Spread ~0,5–1 pip = ~€0,50–1,00 su €100; no commissioni | ~0,01–0,05% per notte per posizione | ✅ | Leva reale utile anche su €1k, spread fissi, API REST, paper account, buona documentazione | Rischio di overfit su leva; funding overnight; forex richiede agenti macro dedicati | Quando si vuole introdurre leva in modo controllato su un mercato liquido | Nuovo adapter `broker_oanda.py` + agente forex dedicato (segnali su pair) |
| **Prossimo step B** | Crypto con leva | BTC/ETH perp futures | Kraken Futures | 🔶 Alta | 🔶 Media (API REST + WebSocket) | 2:1 – 50:1 | Maker ~0,02%; taker ~0,05% su €100 = €0,05–0,10 | Funding ogni 8h (~0,01–0,1% per notte) | ✅ | Costi bassi, leva flessibile, API pubblica, nessun KYC avanzato per futures | Funding variabile può erodere P&L su hold lunghi; più complesso del spot | Quando si vuole leva su crypto senza passare a IBKR | Nuovo adapter + logica funding + aggiornamento `ratchet_manager` per funding cost |
| **Espansione futura** | Azioni globali | EU, JP, UK, HK | Interactive Brokers | 🔵 Media | 🔴 Alta complessità (TWS API / IBKR REST beta) | 1:3 – 1:4 tipico UE | €1–2 commissione minima per ordine — **proibitivo su ticket €100** | Variabile per paese | ✅ | Accesso globale unico, regolamentato, API potente | Commissioni minime pesanti su ticket piccoli; TWS da tenere attivo; onboarding lungo | Solo quando il ticket medio supera €500–1.000 | Broker abstraction obbligatoria prima; adapter IBKR è il più complesso |
| **Espansione futura** | Futures (ES, NQ, CL, GC) | Macro hedging, commodity | Interactive Brokers | 🔵 Media | 🔴 Alta complessità | 1:10 – 1:50 (regolamentato) | $2–5 per contratto + spread | Nessuno (mark-to-market giornaliero) | ✅ | Leva reale, mercati profondi, hedging efficiente | Contratti grandi (ES mini = $65 per punto); margine elevato; complessità gestione scadenze | Solo con capitale >€10k e pipeline dedicata ai futures | Nuovo layer scadenze + rolling + margine tracking |
| **Espansione futura** | Indici CFD / Commodity | SPX, DAX, Oil, Gold | OANDA o broker CFD (IG) | 🔵 Bassa | 🔶 Media | 10:1 – 200:1 | Spread ~0,5–2 punti; no commissioni | ~0,01–0,03% per notte | ✅ | Accesso semplice a indici con leva; buoni per segnali macro | CFD = prodotto a scadenza virtuale; costo overnight si accumula; regolamentazione ESMA limita leva retail | Se si vogliono segnali macro sull'indice senza futures IBKR | Adapter OANDA già fatto coprirebbe anche questo con symbol mapping |
| **Lungo termine** | Opzioni USA | AAPL/NVDA/SPY options | Alpaca o IBKR | 🔵 Bassa | 🔴 Alta (Greeks, catene, scadenze) | Leva implicita | Bid-ask spread molto variabile | Theta decay (non overnight fisso) | ✅ (put) | Leva definita con rischio limitato (long options) | Altissima complessità; richiede agenti Greeks dedicati; liquidità variabile per strike lontani | Dopo consolidamento di almeno 2 broker e track record reale ≥6 mesi | Nuovi agenti (Greeks, IV rank, skew); adapter opzioni separato |

---

## 4. Regole Strategiche

| # | Regola | Motivazione |
|---|--------|-------------|
| R1 | Non fare affidamento sulla leva azionaria Alpaca per conto piccolo | 2× RegT su $1k = $2k buying power: margine minimo, rischio amplificato, nessun vantaggio reale |
| R2 | Su ticket piccoli (≤€100), spread e slippage contano più delle commissioni nominate | Una commissione "zero" con spread 0,3% costa €0,60 su €100 round-trip — più di IBKR su ticket grandi |
| R3 | Il layer di analisi è già broker-agnostico: non toccare gli agenti per aggiungere un broker | L'executor riceve un segnale tipizzato; il broker adapter traduce in API calls |
| R4 | Introdurre un `BrokerAdapter` generico con `capability_flags` prima di aggiungere il 3° broker | Evita duplicazione di logica in executor; i flags dichiarano cosa supporta ogni broker (fractional, bracket, short, futures, options) |
| R5 | Non aprire posizioni con leva finché il sistema non ha track record reale positivo (≥3 mesi) | La leva amplifica gli errori di un sistema non ancora validato su dati reali |
| R6 | Mantenere separati i costi di funding (overnight, rollover) dal P&L grezzo nei log | Altrimenti il sistema impara a tenere posizioni overnight senza prezzare il costo reale |
| R7 | Paper trading su ogni nuovo broker prima di live | Alpaca ha paper mode nativo; OANDA e Kraken hanno entrambi sandbox/demo |

---

## 5. Ordine Consigliato di Espansione

> **Nota priorità (2026-04-07):** La Fase 0 è ancora in corso e va completata prima di procedere.
> Il passo immediato è osservare il comportamento reale del sistema su Alpaca paper (≥50 trade chiusi),
> poi fare tuning sulla base dei dati reali. L'espansione broker non è il next step — viene solo dopo
> una baseline stabile. Riferimento: sezione "Fase 1–2" in `ROADMAP.md`.

| Fase | Azione | Prerequisito | Stima impatto |
|------|--------|--------------|---------------|
| **0 — Attuale** | Osservare e validare il sistema su Alpaca paper: esecuzioni, SL/TP, ratchet, short, signal evaluations | — | Nessuno — solo raccolta dati |
| **0b — Tuning** | Analizzare trade chiusi reali e calibrare parametri (confidence, pesi agenti, ATR multiplier) | ≥50 trade chiusi | Miglioramento segnali senza infrastruttura nuova |
| **1 — Breve termine** | Track record reale ≥3 mesi con P&L positivo o breakeven | Tuning completato su Alpaca | Baseline per validare la pipeline prima di broker aggiuntivi |
| **2 — Medio termine** | Aggiungere OANDA (forex) **oppure** Kraken Futures (crypto leveraged) | Broker abstraction minima in `executor.py` | +1 adapter, +1 set di agenti specializzati |
| **3 — Medio termine** | Introdurre `BrokerAdapter` con `capability_flags` | Almeno 2 broker attivi | Refactor executor; nessuna modifica agli agenti |
| **4 — Lungo termine** | Integrare Interactive Brokers | Ticket medio >€500, capitale >€5k, track record >6 mesi | Adapter complesso; accesso a azioni globali e futures |
| **5 — Lungo termine** | Aprire a futures / opzioni / global equities tramite IBKR | Fase 4 completata + agenti dedicati | Nuovi agenti Greeks, scadenze, margine dinamico |

---

## 6. Decisione Rapida

> *"Se voglio X, uso Y."*

| Voglio... | Usa | Note |
|-----------|-----|------|
| Continuare con azioni USA zero-commissioni | **Alpaca** | Già integrato, nessun costo |
| Aggiungere crypto spot senza cambiar broker | **Alpaca** | Ok finché il ticket sale; fix TIF già in produzione |
| Introdurre leva in modo controllato e poco costoso | **OANDA** (forex) | API relativamente semplice, paper mode, spread fissi |
| Leva su crypto senza l'overhead di IBKR | **Kraken Futures** | Costi molto bassi, funding ogni 8h, API pubblica |
| Accesso a azioni europee, asiatiche, ETF globali | **Interactive Brokers** | Ma solo con ticket >€500 per ammortizzare commissioni minime |
| Futures su indici/commodity (ES, NQ, CL, GC) | **Interactive Brokers** | Solo con capitale >€10k; alta complessità |
| Opzioni USA | **Alpaca** (base) o **IBKR** (avanzato) | Solo dopo track record reale e agenti Greeks |
| Indici CFD senza futures | **OANDA** o IG | Adapter OANDA già pianificato copre anche questo |
| Minimizzare il rischio di integrazione | **Nessun nuovo broker** | Consolidare prima il track record su Alpaca |

---

## 7. Note Tecniche per l'Implementazione

### Struttura adapter suggerita (fase 3)

```python
class BrokerAdapter(Protocol):
    capabilities: dict  # {"fractional": True, "bracket": True, "short": True, "futures": False, ...}

    def submit_order(self, ticker, qty, side, sl, tp) -> dict: ...
    def get_position(self, ticker) -> dict | None: ...
    def get_equity(self) -> float: ...
    def close_position(self, ticker) -> dict | None: ...
```

Il campo `capabilities` permette all'executor di adattare il comportamento (es: non tentare bracket su broker che non lo supporta) senza `if broker_type == "alpaca"` hardcodati.

### File da creare per ogni nuovo broker

```
engine/
  broker_alpaca.py     ← già presente
  broker_oanda.py      ← da creare (fase 2)
  broker_kraken.py     ← da creare (fase 2, alternativa)
  broker_ibkr.py       ← da creare (fase 4)
  broker_base.py       ← Protocol/ABC (fase 3)
```

### Considerazioni funding su leva

Per OANDA e Kraken Futures, il funding overnight va loggato separatamente in Supabase:

```sql
-- tabella suggerita
funding_costs (id, ticker, broker, rate, amount_usd, timestamp)
```

E sottratto dal P&L lordo nello `ScoringEngine` prima di calcolare `return_Xh`.

---

---

## 8. Broker-Aware Market Data Routing (futura)

> **Stato (2026-04-15):** decisione documentata, nessun codice modificato. Da implementare in Fase 3 quando si aggiunge il 2° broker.

### Problema

Il `position_manager.yml` (e più in generale ogni logica di prezzo live) deve sapere da quale fonte ottenere il prezzo corrente di una posizione. Questo non è banale quando ci sono più broker attivi con mercati diversi.

Sintomi osservati in produzione paper:
- yfinance timeout su alcuni ticker (V, LMT, BAC) → `get_latest_price()` restituisce `None` → posizione skippata silenziosamente nel position manager
- La fonte corretta per una posizione Alpaca è **Alpaca Market Data**, non yfinance — Alpaca ha dati real-time, yfinance ha latenza e rate limit

### Architettura proposta

```python
class MarketDataAdapter(Protocol):
    """Fonte di prezzo per un broker specifico."""
    def get_price(self, ticker: str) -> float | None: ...
    def supports(self, ticker: str) -> bool: ...

class AlpacaMarketDataAdapter:
    """Usa Alpaca Market Data API — real-time, nessun rate limit."""
    def get_price(self, ticker: str) -> float | None: ...

class MetaTraderMarketDataAdapter:
    """Usa MT5 terminal — richiede terminale MetaTrader attivo (VPS Windows)."""
    def get_price(self, ticker: str) -> float | None: ...

class YahooFinanceAdapter:
    """Fallback — latenza alta, rate limit, non adatto per posizioni live."""
    def get_price(self, ticker: str) -> float | None: ...

class MarketDataRouter:
    """Seleziona la fonte giusta in base al broker della posizione."""
    def get_price(self, ticker: str, broker: str) -> float | None:
        adapter = self._adapters.get(broker, self._fallback)
        return adapter.get_price(ticker)
```

### Regole di routing

| Broker posizione | Fonte primaria | Fallback |
|-----------------|----------------|----------|
| Alpaca | Alpaca Market Data (`AlpacaBroker.get_latest_price()`) | yfinance |
| OANDA | OANDA price stream / REST | yfinance |
| FTMO / MetaTrader | MT5 terminal | — (no fallback affidabile) |
| Kraken Futures | Kraken API | yfinance |

### Vincolo infrastrutturale FTMO/MT5

MetaTrader 5 richiede:
- Terminale MT5 installato e connesso attivamente al broker
- Sessione persistente (no avvio/spegnimento per ogni check)
- Sistema operativo Windows (MT5 non ha client Linux nativo)

→ **GitHub Actions non è adatto** per MetaTrader come broker live. Un'integrazione FTMO richiederebbe VPS Windows dedicato (~€10-15/mese) con terminale MT5 sempre attivo.

Questa è la ragione principale per cui FTMO non è nella lista broker prioritari nonostante condizioni interessanti (no commissioni, prop trading challenge).

### Stato attuale (già corretto)

`AlpacaBroker.get_latest_price()` usa già le Alpaca Market Data API, non yfinance. Il `position_manager.yml` usa `broker.get_latest_price()` — questo è il comportamento corretto.

Il `MarketDataRouter` formale va implementato **solo quando si aggiunge il 2° broker** con mercato diverso da Alpaca.

---

*Documento operativo — aggiornare a ogni cambio di strategia broker o apertura di nuovo mercato.*
