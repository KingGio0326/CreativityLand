'use client'

import { useState } from 'react'

const agents = [
  {
    id: 'sentiment', name: 'SentimentAgent', abbr: 'SE',
    color: '#4facfe', bg: 'rgba(79,172,254,0.15)', weight: '22%',
    tagline: 'Legge l\'umore del mercato su 8+ fonti',
    category: ['active','news'],
    analogy: 'Come un reporter che legge 100 articoli al giorno e capisce se il "tono" delle notizie su un\'azienda e positivo, negativo o neutro.',
    desc: 'Usa FinBERT -- un modello AI addestrato su testi finanziari -- per analizzare centinaia di articoli di news. Non guarda solo le parole, ma il contesto. "Apple crolla" e diverso da "Apple cresce meno del previsto".',
    stats: [{ label: 'Fonti', val: '8+' }, { label: 'Articoli/run', val: '~650' }, { label: 'Peso', val: '22%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 88 }, { label: 'Velocita di aggiornamento', val: 95 }],
    signals: [
      { type: 'buy', text: 'Molte notizie positive, sentiment score > 0.6' },
      { type: 'sell', text: 'Notizie negative prevalenti, score < -0.4' },
      { type: 'hold', text: 'Notizie miste o poche notizie disponibili' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'Score vicino a +1.0 = euforia (attenzione ai reversal)' },
      { color: '#f25c5c', text: 'Score vicino a -1.0 = panico (possibile rimbalzo)' },
      { color: '#f5c842', text: 'Score vicino a 0 = mercato indeciso o assenza di notizie' },
    ],
    tip: 'Le notizie geopolitiche (guerre, sanzioni, tassi Fed) hanno un peso 2x rispetto alle notizie normali grazie al sistema di geo-weighting.',
  },
  {
    id: 'fundamental', name: 'FundamentalAgent', abbr: 'FA',
    color: '#f59142', bg: 'rgba(245,145,66,0.15)', weight: '18%',
    tagline: 'Analizza la salute finanziaria dell\'azienda',
    category: ['active'],
    analogy: 'Come un revisore dei conti che guarda i bilanci di un\'azienda e decide se vale quello che costa in borsa.',
    desc: 'Legge P/E ratio, PEG, ROE, EPS growth e le raccomandazioni degli analisti istituzionali. E l\'agente piu "classico" -- guarda se l\'azienda e cara o economica rispetto ai suoi guadagni.',
    stats: [{ label: 'P/E target', val: '<25' }, { label: 'ROE target', val: '>15%' }, { label: 'Peso', val: '18%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 72 }, { label: 'Frequenza aggiornamento dati', val: 45 }],
    signals: [
      { type: 'buy', text: 'P/E basso, ROE alto, analisti ottimisti (Strong Buy)' },
      { type: 'sell', text: 'P/E altissimo, crescita EPS negativa, downgrade analisti' },
      { type: 'hold', text: 'Dati misti o assenza di copertura analitica' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'BTC-USD e ETH-USD danno HTTP 404 -- normale, non hanno fondamentali' },
      { color: '#f5c842', text: 'P/E <15 = potenzialmente sottovalutato. P/E >40 = caro ma puo crescere ancora' },
      { color: '#f59142', text: 'ROE >20% = azienda molto efficiente nel generare utili' },
    ],
    tip: 'GLD (oro) e crypto non hanno fondamentali tradizionali. Per questi ticker l\'agente restituisce HOLD con confidence bassa.',
  },
  {
    id: 'momentum', name: 'MomentumAgent', abbr: 'MO',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', weight: '12%',
    tagline: 'Segue la forza del trend in corso',
    category: ['active','technical'],
    analogy: 'Come guardare se un\'auto sta accelerando o decelerando. Non importa la direzione attuale, importa se sta guadagnando o perdendo velocita.',
    desc: 'Misura il momentum su piu timeframe: 5, 10, 20, 60 giorni. Se il prezzo sale su tutti i timeframe, il momentum e forte. Se diverge (sale sul breve ma scende sul lungo), e un segnale di attenzione.',
    stats: [{ label: 'Timeframe', val: '4' }, { label: 'Periodo', val: '5-60d' }, { label: 'Peso', val: '12%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 48 }, { label: 'Reattivita ai movimenti recenti', val: 85 }],
    signals: [
      { type: 'buy', text: 'Momentum positivo su tutti i timeframe (allineamento)' },
      { type: 'sell', text: 'Momentum negativo su tutti i timeframe' },
      { type: 'hold', text: 'Segnali contrastanti tra timeframe diversi' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'Allineamento su tutti i timeframe = segnale forte e affidabile' },
      { color: '#f25c5c', text: 'Divergenza (breve positivo, lungo negativo) = possibile inversione' },
      { color: '#a78bfa', text: 'Momentum != previsione: il trend puo continuare o invertirsi' },
    ],
    tip: 'Il momentum e uno degli effetti piu documentati in finanza. Azioni che salgono tendono a continuare a salire nel breve termine.',
  },
  {
    id: 'technical', name: 'TechnicalAgent', abbr: 'TA',
    color: '#34d399', bg: 'rgba(52,211,153,0.15)', weight: '11%',
    tagline: 'Legge i grafici con indicatori classici',
    category: ['active','technical'],
    analogy: 'Come un geometra che misura esattamente dove si trova il prezzo rispetto alle sue "zone di conforto" storiche.',
    desc: 'Combina RSI (forza relativa), MACD (convergenza/divergenza), Bande di Bollinger (volatilita) e medie mobili MA50/MA200. Identifica golden cross e death cross.',
    stats: [{ label: 'Indicatori', val: '5+' }, { label: 'Golden Cross', val: 'MA50>200' }, { label: 'Peso', val: '11%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 44 }, { label: 'Copertura segnali tecnici', val: 70 }],
    signals: [
      { type: 'buy', text: 'RSI < 30 (ipervenduto), Golden Cross MA50>MA200, MACD rialzista' },
      { type: 'sell', text: 'RSI > 70 (ipercomprato), Death Cross MA50<MA200, MACD ribassista' },
      { type: 'hold', text: 'RSI neutro (40-60), nessun cross, Bollinger contratto' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'RSI 30-70 = zona neutrale. Sotto 30 = ipervenduto. Sopra 70 = ipercomprato' },
      { color: '#f5c842', text: 'Golden Cross (MA50 supera MA200) = segnale rialzista storico molto forte' },
      { color: '#34d399', text: 'Bande di Bollinger strette = poca volatilita, esplosione imminente' },
    ],
    tip: 'Il RSI a 70+ non significa "vendi subito" -- in trend forti puo restare alto a lungo. Il contesto conta.',
  },
  {
    id: 'ml', name: 'MLPredictionAgent', abbr: 'ML',
    color: '#f472b6', bg: 'rgba(244,114,182,0.15)', weight: '11%',
    tagline: 'Predice il futuro con intelligenza artificiale',
    category: ['active'],
    analogy: 'Come uno studente che ha letto 2 anni di storia del mercato e cerca di capire "questa situazione a quale altra assomiglia e come e andata?"',
    desc: 'Usa GradientBoosting con 20+ feature: RSI, MACD, volatilita, momentum, rate direction, sentiment, volume. Addestrato con walk-forward validation per evitare di "imparare il futuro".',
    stats: [{ label: 'Algoritmo', val: 'GBClassifier' }, { label: 'Feature', val: '20+' }, { label: 'Peso', val: '11%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 44 }, { label: 'Accuracy media NVDA', val: 62 }],
    signals: [
      { type: 'buy', text: 'Modello predice rialzo con accuracy > 52% e modello affidabile' },
      { type: 'sell', text: 'Modello predice ribasso con alta confidence' },
      { type: 'hold', text: 'Confidence bassa o modello non affidabile (-25% confidence)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"wf_acc=0.61" = accuratezza walk-forward 61% -- sopra il caso (50%)' },
      { color: '#f25c5c', text: '"modello non affidabile" = std > 10% o accuracy < 52% -- peso ridotto del 25%' },
      { color: '#f472b6', text: 'TSLA (40%) e GLD (45%) non affidabili. NVDA (61%) e MSFT (60%) affidabili' },
    ],
    tip: '52% di accuracy puo sembrare poco ma nel trading e sufficiente per avere edge positivo se la gestione del rischio e corretta.',
  },
  {
    id: 'liquidity', name: 'LiquidityAgent', abbr: 'LI',
    color: '#22d3a0', bg: 'rgba(34,211,160,0.1)', weight: '8%',
    tagline: 'Monitora i rubinetti del denaro globale',
    category: ['active','macro'],
    analogy: 'Come controllare la pressione dell\'acqua nei tubi prima di aprire il rubinetto. Se la Fed drena liquidita, tutti i mercati scendono indipendentemente dai fondamentali.',
    desc: 'Usa la FRED API per monitorare: Fed balance sheet, M2 money supply, SOFR, EURIBOR, VIX. Quando la liquidita si contrae, quasi tutto scende.',
    stats: [{ label: 'Fonte', val: 'FRED API' }, { label: 'Serie', val: '10+' }, { label: 'Peso', val: '8%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 32 }, { label: 'Copertura macro globale', val: 75 }],
    signals: [
      { type: 'buy', text: 'Fed espande balance sheet, M2 in crescita, VIX basso' },
      { type: 'sell', text: 'Fed restringe, M2 in calo, tassi overnight alti, VIX > 30' },
      { type: 'hold', text: 'Situazione mista o stabile (ora: stable +0.5%, VIX 22.4)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"Fed balance sheet stable (+0.5%)" = nessuna restrizione attiva' },
      { color: '#f5c842', text: '"VIX 22.4 (elevated)" = volatilita sopra la media, mercato nervoso' },
      { color: '#f25c5c', text: '"Fed funds rate falling" = tassi in calo = positivo per growth stocks' },
    ],
    tip: 'VIX sotto 15 = calma. 15-25 = normale. 25-35 = paura. Sopra 35 = panico. Ora siamo a 22.4: elevated ma non panico.',
  },
  {
    id: 'options', name: 'OptionsAgent', abbr: 'OP',
    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', weight: '6%',
    tagline: 'Spia il mercato dei derivati',
    category: ['active'],
    analogy: 'Come guardare dove i grandi giocatori piazzano le loro scommesse sui derivati. Il max pain e dove il prezzo "vuole" andare per fare perdere piu soldi al maggior numero di opzionisti.',
    desc: 'Analizza put/call ratio, max pain e implied volatility. Il put/call ratio misura quante scommesse al ribasso ci sono rispetto a quelle al rialzo.',
    stats: [{ label: 'Metrica', val: 'PC ratio' }, { label: 'Max Pain', val: 'Calcolato' }, { label: 'Peso', val: '6%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 24 }, { label: 'Potere predittivo OpEx week', val: 80 }],
    signals: [
      { type: 'buy', text: 'PC ratio < 0.7 (piu call che put), prezzo sopra max pain' },
      { type: 'sell', text: 'PC ratio > 1.2 (piu put che call), alto short interest' },
      { type: 'hold', text: 'PC ratio 0.7-1.2 (equilibrio)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"PC ratio 0.812 (neutro)" = equilibrio tra scommesse rialziste e ribassiste' },
      { color: '#fbbf24', text: '"Max Pain $185 (52.8% sotto)" = il prezzo e molto sopra dove i MM farebbero perdere di piu' },
      { color: '#f472b6', text: '"IV 24.69%" = volatilita implicita -- piu e alta, piu il mercato si aspetta movimenti forti' },
    ],
    tip: 'La terza settimana di ogni mese (OpEx week) e la piu importante: i market maker muovono il prezzo verso il max pain.',
  },
  {
    id: 'macro', name: 'MacroAgent', abbr: 'MA',
    color: '#818cf8', bg: 'rgba(129,140,248,0.12)', weight: '4%',
    tagline: 'L\'analista macro con accesso a Claude AI',
    category: ['active','macro'],
    analogy: 'Come un economista che legge le notizie geopolitiche, i dati Fed e la letteratura accademica, poi chiede a un esperto (Claude AI) di sintetizzare tutto.',
    desc: 'L\'unico agente che usa Claude API per ragionare. Riceve articoli geopolitici ad alta rilevanza, rate direction (TLT proxy), research context da arXiv. Produce una valutazione qualitativa con reasoning dettagliato.',
    stats: [{ label: 'LLM', val: 'Claude' }, { label: 'Input', val: '3 fonti' }, { label: 'Peso', val: '4%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 16 }, { label: 'Ricchezza del reasoning', val: 95 }],
    signals: [
      { type: 'buy', text: 'Macro favorevole: liquidita in espansione, geopolitica stabile' },
      { type: 'sell', text: 'Recessione imminente, sanzioni, crisi energetica, stretta monetaria' },
      { type: 'hold', text: 'Incertezza macro -- situazione mista difficile da interpretare' },
    ],
    interpret: [
      { color: '#818cf8', text: '"Rate direction: falling" = tassi in calo, positivo per growth e crypto' },
      { color: '#22d3a0', text: '"Integrato insight da 3 paper arXiv" = research context attivo' },
      { color: '#f5c842', text: '"geo_articles: 2 high, 4 medium" = notizie geopolitiche pesano nel contesto' },
    ],
    tip: 'Peso basso (4%) perche il giudizio qualitativo e meno preciso di segnali quantitativi. Ma il reasoning e prezioso per capire il contesto.',
  },
  {
    id: 'meanreversion', name: 'MeanReversionAgent', abbr: 'MR',
    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', weight: '2%',
    tagline: 'Scommette sul ritorno alla media',
    category: ['active','technical'],
    analogy: 'Come scommettere che una montagna russa che e salita molto tornera giu. I prezzi tendono a tornare verso la loro media storica.',
    desc: 'Calcola lo z-score (quante deviazioni standard siamo dalla media) e il Bollinger %B. Se il prezzo e troppo distante dalla media, scommette sul ritorno.',
    stats: [{ label: 'Metrica', val: 'Z-score' }, { label: 'Soglia', val: '+/-2s' }, { label: 'Peso', val: '2%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 8 }, { label: 'Affidabilita in trend forti', val: 20 }],
    signals: [
      { type: 'buy', text: 'Z-score < -2 (prezzo molto sotto la media), %B < 0' },
      { type: 'sell', text: 'Z-score > 2 (prezzo molto sopra la media), %B > 1' },
      { type: 'hold', text: 'Prezzo vicino alla media, z-score tra -1 e +1' },
    ],
    interpret: [
      { color: '#94a3b8', text: 'Z-score = distanza dalla media in "deviazioni standard". >2 e statisticamente estremo' },
      { color: '#f5c842', text: 'Funziona meglio in mercati laterali. In trend forti puo restare estremo a lungo' },
      { color: '#22d3a0', text: 'Peso ridotto a 2% perche spesso contrasta con TechnicalAgent e MomentumAgent' },
    ],
    tip: 'Mean reversion e l\'opposto del momentum. Entrambi funzionano, ma in situazioni diverse. Il sistema li bilancia automaticamente.',
  },
  {
    id: 'intermarket', name: 'IntermarketAgent', abbr: 'IM',
    color: '#6366f1', bg: 'rgba(99,102,241,0.12)', weight: '4%',
    tagline: 'Legge le relazioni tra mercati diversi',
    category: ['active','macro'],
    analogy: 'Come capire che quando il dollaro si rafforza, l\'oro tende a scendere. I mercati sono tutti collegati.',
    desc: 'Implementa le relazioni intermarket di John Murphy: USD forte = tech e crypto scendono. Bond yield alto = growth stocks scendono. Petrolio alto = XOM sale.',
    stats: [{ label: 'Relazioni', val: '4 tipi' }, { label: 'ETF proxy', val: 'UUP/TLT' }, { label: 'Peso', val: '4%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 16 }, { label: 'Utilita in contesti macro forti', val: 85 }],
    signals: [
      { type: 'buy', text: 'Dollar debole, bond yield in calo, VIX in calo, settore forte' },
      { type: 'sell', text: 'Dollar forte, bond yield alto, VIX in salita, settore debole' },
      { type: 'hold', text: 'Segnali contrastanti tra i diversi mercati' },
    ],
    interpret: [
      { color: '#6366f1', text: '"USD forte (+2.1%) = BEARISH per AAPL" = profitti esteri valgono meno in USD' },
      { color: '#22d3a0', text: '"Petrolio in rialzo = BULLISH per XOM" = Exxon guadagna di piu' },
      { color: '#f5c842', text: '"Bond 10Y yield in salita = BEARISH per NVDA" = tassi alti = crescita futura vale meno oggi' },
    ],
    tip: 'Con la guerra in Medio Oriente: petrolio sale = XOM BULLISH. Ma USD sale (bene rifugio) = AAPL/NVDA BEARISH. Tutto e connesso.',
  },
  {
    id: 'seasonal', name: 'SeasonalAgent', abbr: 'SN',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', weight: '4%',
    tagline: 'Sfrutta i pattern stagionali del mercato',
    category: ['active'],
    analogy: 'Come sapere che i saldi di fine stagione arrivano sempre in gennaio e luglio. Il mercato ha i suoi "saldi" stagionali prevedibili.',
    desc: 'Riconosce: January Effect, Sell in May, September Effect, Santa Rally, OpEx week, Quarter End rebalancing, Monday Effect.',
    stats: [{ label: 'Effetti', val: '9' }, { label: 'Ora attivo', val: 'Q-End' }, { label: 'Peso', val: '4%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 16 }, { label: 'Affidabilita storica pattern', val: 65 }],
    signals: [
      { type: 'buy', text: 'January Effect (gennaio), Santa Rally (nov-dic), post-OpEx' },
      { type: 'sell', text: 'Sell in May (maggio-settembre), September Effect' },
      { type: 'hold', text: 'Periodo neutro o effetti contrastanti (OpEx, Q-end)' },
    ],
    interpret: [
      { color: '#f59e0b', text: '"Quarter End Rebalancing" (ora attivo) = fondi ribilanciano i portfolio a fine marzo' },
      { color: '#22d3a0', text: '"OpEx Week" (15-21 del mese) = market maker chiudono le opzioni' },
      { color: '#f25c5c', text: '"September Effect" = storicamente il peggior mese dell\'anno per le azioni USA' },
    ],
    tip: 'Oggi siamo in "Quarter End Rebalancing" -- i grandi fondi devono ribilanciare entro il 31 marzo. Aspettati piu volatilita.',
  },
  {
    id: 'institutional', name: 'InstitutionalAgent', abbr: 'IN',
    color: '#10b981', bg: 'rgba(16,185,129,0.1)', weight: '4%',
    tagline: 'Segue il "smart money" istituzionale',
    category: ['active'],
    analogy: 'Come spiare cosa fanno Berkshire Hathaway, BlackRock e i CEO con i propri soldi. Se il CEO compra azioni proprie, sa qualcosa che tu non sai.',
    desc: 'Legge insider transactions, flussi degli ETF settoriali (XLK, XLE, IBIT) e ownership istituzionale. "Smart money" che compra = segnale bullish.',
    stats: [{ label: 'Fonte', val: 'yfinance' }, { label: 'Lookback', val: '90 giorni' }, { label: 'Peso', val: '4%' }],
    meters: [{ label: 'Influenza sul segnale finale', val: 16 }, { label: 'Affidabilita segnale insider', val: 70 }],
    signals: [
      { type: 'buy', text: 'Insider in acquisto, ETF in inflow, ownership istituzionale > 75%' },
      { type: 'sell', text: 'Insider in vendita massiva, ETF in outflow, ownership < 30%' },
      { type: 'hold', text: 'Nessuna transazione rilevante o segnali misti' },
    ],
    interpret: [
      { color: '#10b981', text: '"Smart money in acquisto" = notizia bullish. I CEO rischiano in proprio.' },
      { color: '#f25c5c', text: '"Insider vendono" = puo essere liquidita personale oppure segnale preoccupante' },
      { color: '#f5c842', text: '"ETF XLK inflow (+3.2% 30d)" = denaro che entra nel settore tech' },
    ],
    tip: 'Gli insider possono vendere per mille motivi. Ma quando comprano, di solito e perche credono nel titolo.',
  },
  {
    id: 'research', name: 'ResearchAgent', abbr: 'RA',
    color: '#ec4899', bg: 'rgba(236,72,153,0.1)', weight: '0%',
    tagline: 'Legge paper accademici e sintetizza con AI',
    category: ['support'],
    analogy: 'Come avere un PhD in finanza quantitativa nel team che ogni giorno legge i paper piu recenti di arXiv e dice "questo studio supporta o smentisce il nostro segnale?"',
    desc: 'Cerca su arXiv i paper piu recenti su ML per trading, regime detection, sentiment analysis. Claude API sintetizza i risultati. Output usato da MacroAgent e WeightedVotingAgent (+/-5% confidence).',
    stats: [{ label: 'Fonte', val: 'arXiv' }, { label: 'Query', val: '10 preset' }, { label: 'Ruolo', val: 'Context' }],
    meters: [{ label: 'Influenza indiretta', val: 20 }, { label: 'Ricchezza del contesto', val: 90 }],
    signals: [
      { type: 'buy', text: '"Letteratura conferma il segnale" = confidence +5%' },
      { type: 'sell', text: '"Letteratura smentisce il segnale" = confidence -5%' },
      { type: 'hold', text: 'Letteratura mista o neutrale = nessun boost' },
    ],
    interpret: [
      { color: '#ec4899', text: 'Peso 0% = non vota direttamente, ma modifica la confidence degli altri' },
      { color: '#22d3a0', text: '"3 paper arXiv integrati" = research context attivo e funzionante' },
      { color: '#a78bfa', text: 'Gli insights vengono mostrati nella card Research della dashboard /agents' },
    ],
    tip: 'arXiv e gratuito e pubblica ogni giorno decine di paper su ML finanziario. Il ResearchAgent ti tiene aggiornato senza leggerli manualmente.',
  },
  {
    id: 'risk', name: 'RiskAgent', abbr: 'RI',
    color: '#f43f5e', bg: 'rgba(244,63,94,0.1)', weight: '0%',
    tagline: 'Il guardiano: blocca i segnali pericolosi',
    category: ['support'],
    analogy: 'Come un semaforo che non ti dice dove andare, ma ti ferma se stai per attraversare con il rosso. Non decide il segnale, ma puo annullarlo se troppo rischioso.',
    desc: 'Calcola il Kelly Criterion per il position sizing ottimale, valuta il rischio di correlazione tra posizioni aperte, e funge da gate finale.',
    stats: [{ label: 'Formula', val: 'Kelly 0.5x' }, { label: 'Max pos.', val: '25% cap' }, { label: 'Ruolo', val: 'Gate' }],
    meters: [{ label: 'Potere di veto', val: 100 }, { label: 'Frequenza di intervento', val: 30 }],
    signals: [
      { type: 'buy', text: 'Segnale passa: confidence > soglia, bassa correlazione, Kelly positivo' },
      { type: 'sell', text: 'Segnale bloccato: edge negativo, alta correlazione, rischio eccessivo' },
      { type: 'hold', text: 'Confidence ridotta: Kelly suggerisce posizione molto piccola' },
    ],
    interpret: [
      { color: '#f43f5e', text: '"Kelly 8.5% del capitale" = non rischiare piu dell\'8.5% su questo trade' },
      { color: '#f5c842', text: '"Edge positivo" = il sistema ha storicamente guadagnato con questo tipo di segnale' },
      { color: '#22d3a0', text: '"Win rate 0.55" = il bot ha ragione il 55% delle volte (default iniziale)' },
    ],
    tip: 'Il Kelly Criterion dice: se hai un vantaggio statistico, quanto dovresti rischiare per massimizzare la crescita del capitale? Di solito: meno di quello che pensi.',
  },
]

const FILTERS = [
  { key: 'all', label: 'Tutti (14)' },
  { key: 'active', label: 'Attivi' },
  { key: 'support', label: 'Supporto' },
  { key: 'news', label: 'News' },
  { key: 'technical', label: 'Tecnici' },
  { key: 'macro', label: 'Macro' },
]

function AgentCard({ agent }: { agent: typeof agents[0] }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const signalColor: Record<string, string> = { buy: '#22d3a0', sell: '#f25c5c', hold: '#f5c842' }
  const signalBg: Record<string, string> = { buy: 'rgba(34,211,160,0.1)', sell: 'rgba(242,92,92,0.1)', hold: 'rgba(245,200,66,0.1)' }

  return (
    <div
      onClick={() => setOpen(!open)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: open ? '#16163a' : hovered ? '#14142e' : '#12121a',
        border: `1px solid ${
          open
            ? 'rgba(124,58,237,0.35)'
            : hovered
            ? 'rgba(124,58,237,0.2)'
            : 'rgba(255,255,255,0.07)'
        }`,
        borderRadius: 20,
        overflow: 'hidden',
        cursor: 'pointer',
        transform: !open && hovered ? 'translateY(-2px)' : 'none',
        boxShadow: open
          ? '0 0 0 1px rgba(124,58,237,0.2), 0 20px 50px rgba(0,0,0,0.5)'
          : hovered
          ? '0 8px 24px rgba(0,0,0,0.35)'
          : 'none',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 20 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: agent.bg, color: agent.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14,
        }}>{agent.abbr}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: '#6b6b85', lineHeight: 1.4 }}>{agent.tagline}</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.06)', borderRadius: 8,
          padding: '4px 10px', fontSize: 13, fontWeight: 700, color: agent.color,
          flexShrink: 0,
        }}>{agent.weight}</div>
        <div style={{
          fontSize: 16,
          color: open ? '#a855f7' : '#6b6b85',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1), color 0.2s ease',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          flexShrink: 0,
        }}>&#9662;</div>
      </div>

      {/* Body — always in DOM, animated via max-height + opacity */}
      <div style={{
        maxHeight: open ? 2000 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: open
          ? 'max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease 0.05s'
          : 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
        transform: open ? 'translateY(0)' : 'translateY(-6px)',
      }}>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '20px' }} onClick={e => e.stopPropagation()}>

          {/* Analogy */}
          <div style={{
            background: '#1a1a26', borderRadius: 12, padding: '14px 16px',
            marginBottom: 16, fontSize: 14, lineHeight: 1.6,
            borderLeft: `3px solid ${agent.color}`,
          }}>
            {agent.analogy}
          </div>

          {/* Description */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>Come funziona</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#b0b0c8' }}>{agent.desc}</p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, background: '#1a1a26', borderRadius: 12, padding: '14px 16px', margin: '16px 0 0', flexWrap: 'wrap' as const }}>
            {agent.stats.map(s => (
              <div key={s.label} style={{ flex: 1, minWidth: 80, textAlign: 'center' as const }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: agent.color, display: 'block', marginBottom: 2 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: '#6b6b85', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Meters — animated width with staggered delay */}
          {agent.meters.map((m, index) => (
            <div key={m.label} style={{ margin: '14px 0' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 12, marginBottom: 6, color: '#6b6b85'
              }}>
                <span>{m.label}</span>
                <span style={{ color: agent.color }}>{m.val}%</span>
              </div>
              <div style={{
                height: 6, background: '#1a1a26',
                borderRadius: 100, overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  width: open ? `${m.val}%` : '0%',
                  background: agent.color,
                  borderRadius: 100,
                  transition: open
                    ? `width 0.7s cubic-bezier(0.4,0,0.2,1) ${index * 0.12 + 0.2}s`
                    : 'width 0.15s ease',
                }} />
              </div>
            </div>
          ))}

          {/* Signals */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>Cosa significa il segnale</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 12 }}>
            {agent.signals.map(s => (
              <div key={s.type} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600,
                background: signalBg[s.type],
                color: signalColor[s.type],
                border: `1px solid ${signalColor[s.type]}33`,
              }}>
                <span>{s.type === 'buy' ? '\u25B2' : s.type === 'sell' ? '\u25BC' : '\u2014'}</span>
                <span>{s.type.toUpperCase()}</span>
              </div>
            ))}
          </div>
          {agent.signals.map(s => (
            <p key={s.type} style={{ fontSize: 13, lineHeight: 1.5, color: '#b0b0c8', marginBottom: 6 }}>
              <strong style={{ color: signalColor[s.type] }}>{s.type.toUpperCase()}:</strong> {s.text}
            </p>
          ))}

          {/* Interpret */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>Come interpretare i dati</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 8, padding: 0, margin: 0 }}>
            {agent.interpret.map((item, idx) => (
              <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.5, color: '#b0b0c8' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, marginTop: 5, flexShrink: 0 }} />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>

          {/* Tip */}
          <div style={{
            background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)',
            borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#a89ff5',
            marginTop: 16, lineHeight: 1.6,
          }}>
            {agent.tip}
          </div>

        </div>
      </div>
    </div>
  )
}

export default function GuidePage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = agents.filter(a => {
    const matchCat = filter === 'all' || a.category.includes(filter)
    const q = search.toLowerCase()
    const matchSearch = !q || a.name.toLowerCase().includes(q) || a.tagline.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q)
    return matchCat && matchSearch
  })

  return (
    <div style={{ minHeight: '100vh', color: '#e8e8f0' }}>

      {/* Hero */}
      <div style={{ textAlign: 'center' as const, padding: '60px 24px 40px', position: 'relative' as const }}>
        <div style={{ position: 'absolute' as const, top: 0, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse, rgba(124,106,247,0.15) 0%, transparent 70%)', pointerEvents: 'none' as const }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.3)', padding: '6px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: '#7c6af7', textTransform: 'uppercase' as const, marginBottom: 24 }}>
          Guida al Trading Bot
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.05, marginBottom: 16, background: 'linear-gradient(135deg, #fff 0%, #a89ff5 60%, #7c6af7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Il tuo team<br />di 14 analisti
        </h1>
        <p style={{ color: '#6b6b85', fontSize: 16, maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.6 }}>
          Ogni agente analizza il mercato da una prospettiva diversa. Capiscili tutti e interpreta i segnali come un pro.
        </p>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 500, margin: '0 auto 20px', background: '#12121a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '12px 20px' }}>
          <span style={{ color: '#6b6b85' }}>&#128269;</span>
          <input
            type="text"
            placeholder="Cerca un agente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', color: '#e8e8f0', fontFamily: 'inherit', fontSize: 15, width: '100%' }}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 48, padding: '0 24px' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '7px 16px', borderRadius: 100, border: '1px solid',
                borderColor: filter === f.key ? '#7c6af7' : 'rgba(255,255,255,0.07)',
                background: filter === f.key ? '#7c6af7' : 'transparent',
                color: filter === f.key ? 'white' : '#6b6b85',
                fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        className="guide-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 16,
          padding: '0 24px 80px',
          maxWidth: 1200,
          margin: '0 auto',
          alignItems: 'start',
          gridAutoRows: 'min-content',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center' as const, padding: '60px 24px', color: '#6b6b85', fontSize: 15, gridColumn: '1/-1' }}>
            Nessun agente trovato per &quot;{search}&quot;
          </div>
        ) : (
          filtered.map(a => <AgentCard key={a.id} agent={a} />)
        )}
      </div>
    </div>
  )
}
