'use client'

import { useState } from 'react'

const agents = [
  {
    id: 'sentiment', name: 'SentimentAgent', abbr: 'SE',
    color: '#4facfe', bg: 'rgba(79,172,254,0.15)', weight: '22%',
    tagline: 'Reads market mood across 8+ sources',
    category: ['active','news'],
    analogy: 'Like a reporter reading 100 articles a day and figuring out whether the overall "tone" of news about a company is positive, negative, or neutral.',
    desc: 'Uses FinBERT -- an AI model trained on financial text -- to analyze hundreds of news articles. It doesn\'t just look at words, but context. "Apple crashes" is different from "Apple grows less than expected".',
    stats: [{ label: 'Sources', val: '8+' }, { label: 'Articles/run', val: '~650' }, { label: 'Weight', val: '22%' }],
    meters: [{ label: 'Influence on final signal', val: 88 }, { label: 'Update speed', val: 95 }],
    signals: [
      { type: 'buy', text: 'Many positive news articles, sentiment score > 0.6' },
      { type: 'sell', text: 'Predominantly negative news, score < -0.4' },
      { type: 'hold', text: 'Mixed news or few articles available' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'Score near +1.0 = euphoria (watch for reversals)' },
      { color: '#f25c5c', text: 'Score near -1.0 = panic (possible bounce)' },
      { color: '#f5c842', text: 'Score near 0 = indecisive market or lack of news' },
    ],
    tip: 'Geopolitical news (wars, sanctions, Fed rates) carry 2x weight compared to regular news thanks to the geo-weighting system.',
  },
  {
    id: 'fundamental', name: 'FundamentalAgent', abbr: 'FA',
    color: '#f59142', bg: 'rgba(245,145,66,0.15)', weight: '18%',
    tagline: 'Analyzes the company\'s financial health',
    category: ['active'],
    analogy: 'Like an auditor reviewing a company\'s financial statements and deciding whether it\'s worth what it costs on the stock market.',
    desc: 'Reads P/E ratio, PEG, ROE, EPS growth, and institutional analyst recommendations. It\'s the most "classic" agent -- it checks whether a company is expensive or cheap relative to its earnings.',
    stats: [{ label: 'P/E target', val: '<25' }, { label: 'ROE target', val: '>15%' }, { label: 'Weight', val: '18%' }],
    meters: [{ label: 'Influence on final signal', val: 72 }, { label: 'Data update frequency', val: 45 }],
    signals: [
      { type: 'buy', text: 'Low P/E, high ROE, optimistic analysts (Strong Buy)' },
      { type: 'sell', text: 'Very high P/E, negative EPS growth, analyst downgrades' },
      { type: 'hold', text: 'Mixed data or no analyst coverage' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'BTC-USD and ETH-USD return HTTP 404 -- normal, they have no fundamentals' },
      { color: '#f5c842', text: 'P/E <15 = potentially undervalued. P/E >40 = expensive but may still grow' },
      { color: '#f59142', text: 'ROE >20% = very efficient company at generating profits' },
    ],
    tip: 'GLD (gold) and crypto have no traditional fundamentals. For these tickers, the agent returns HOLD with low confidence.',
  },
  {
    id: 'momentum', name: 'MomentumAgent', abbr: 'MO',
    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', weight: '12%',
    tagline: 'Tracks the strength of the current trend',
    category: ['active','technical'],
    analogy: 'Like watching whether a car is accelerating or decelerating. The current direction doesn\'t matter -- what matters is whether it\'s gaining or losing speed.',
    desc: 'Measures momentum across multiple timeframes: 5, 10, 20, 60 days. If the price is rising on all timeframes, momentum is strong. If it diverges (rising short-term but falling long-term), it\'s a warning sign.',
    stats: [{ label: 'Timeframes', val: '4' }, { label: 'Period', val: '5-60d' }, { label: 'Weight', val: '12%' }],
    meters: [{ label: 'Influence on final signal', val: 48 }, { label: 'Responsiveness to recent moves', val: 85 }],
    signals: [
      { type: 'buy', text: 'Positive momentum across all timeframes (alignment)' },
      { type: 'sell', text: 'Negative momentum across all timeframes' },
      { type: 'hold', text: 'Conflicting signals across different timeframes' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'Alignment across all timeframes = strong and reliable signal' },
      { color: '#f25c5c', text: 'Divergence (short-term positive, long-term negative) = possible reversal' },
      { color: '#a78bfa', text: 'Momentum != prediction: the trend may continue or reverse' },
    ],
    tip: 'Momentum is one of the most well-documented effects in finance. Stocks that are rising tend to keep rising in the short term.',
  },
  {
    id: 'technical', name: 'TechnicalAgent', abbr: 'TA',
    color: '#34d399', bg: 'rgba(52,211,153,0.15)', weight: '11%',
    tagline: 'Reads charts with classic indicators',
    category: ['active','technical'],
    analogy: 'Like a surveyor precisely measuring where the price sits relative to its historical "comfort zones".',
    desc: 'Combines RSI (relative strength), MACD (convergence/divergence), Bollinger Bands (volatility), and moving averages MA50/MA200. Identifies golden crosses and death crosses.',
    stats: [{ label: 'Indicators', val: '5+' }, { label: 'Golden Cross', val: 'MA50>200' }, { label: 'Weight', val: '11%' }],
    meters: [{ label: 'Influence on final signal', val: 44 }, { label: 'Technical signal coverage', val: 70 }],
    signals: [
      { type: 'buy', text: 'RSI < 30 (oversold), Golden Cross MA50>MA200, bullish MACD' },
      { type: 'sell', text: 'RSI > 70 (overbought), Death Cross MA50<MA200, bearish MACD' },
      { type: 'hold', text: 'Neutral RSI (40-60), no cross, contracted Bollinger Bands' },
    ],
    interpret: [
      { color: '#22d3a0', text: 'RSI 30-70 = neutral zone. Below 30 = oversold. Above 70 = overbought' },
      { color: '#f5c842', text: 'Golden Cross (MA50 crosses above MA200) = historically very strong bullish signal' },
      { color: '#34d399', text: 'Tight Bollinger Bands = low volatility, breakout imminent' },
    ],
    tip: 'RSI at 70+ doesn\'t mean "sell immediately" -- in strong trends it can stay high for a long time. Context matters.',
  },
  {
    id: 'ml', name: 'MLPredictionAgent', abbr: 'ML',
    color: '#f472b6', bg: 'rgba(244,114,182,0.15)', weight: '11%',
    tagline: 'Predicts the future with artificial intelligence',
    category: ['active'],
    analogy: 'Like a student who has studied 2 years of market history and tries to figure out "which past situation does this resemble, and how did it play out?"',
    desc: 'Uses GradientBoosting with 20+ features: RSI, MACD, volatility, momentum, rate direction, sentiment, volume. Trained with walk-forward validation to avoid "learning the future".',
    stats: [{ label: 'Algorithm', val: 'GBClassifier' }, { label: 'Features', val: '20+' }, { label: 'Weight', val: '11%' }],
    meters: [{ label: 'Influence on final signal', val: 44 }, { label: 'Average accuracy NVDA', val: 62 }],
    signals: [
      { type: 'buy', text: 'Model predicts upside with accuracy > 52% and reliable model' },
      { type: 'sell', text: 'Model predicts downside with high confidence' },
      { type: 'hold', text: 'Low confidence or unreliable model (-25% confidence)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"wf_acc=0.61" = walk-forward accuracy 61% -- above chance (50%)' },
      { color: '#f25c5c', text: '"unreliable model" = std > 10% or accuracy < 52% -- weight reduced by 25%' },
      { color: '#f472b6', text: 'TSLA (40%) and GLD (45%) unreliable. NVDA (61%) and MSFT (60%) reliable' },
    ],
    tip: '52% accuracy may seem low, but in trading it\'s enough to have a positive edge if risk management is done correctly.',
  },
  {
    id: 'liquidity', name: 'LiquidityAgent', abbr: 'LI',
    color: '#22d3a0', bg: 'rgba(34,211,160,0.1)', weight: '8%',
    tagline: 'Monitors global money flow',
    category: ['active','macro'],
    analogy: 'Like checking water pressure in the pipes before turning on the faucet. If the Fed drains liquidity, all markets drop regardless of fundamentals.',
    desc: 'Uses the FRED API to monitor: Fed balance sheet, M2 money supply, SOFR, EURIBOR, VIX. When liquidity contracts, almost everything drops.',
    stats: [{ label: 'Source', val: 'FRED API' }, { label: 'Series', val: '10+' }, { label: 'Weight', val: '8%' }],
    meters: [{ label: 'Influence on final signal', val: 32 }, { label: 'Global macro coverage', val: 75 }],
    signals: [
      { type: 'buy', text: 'Fed expanding balance sheet, M2 growing, low VIX' },
      { type: 'sell', text: 'Fed tightening, M2 declining, high overnight rates, VIX > 30' },
      { type: 'hold', text: 'Mixed or stable situation (current: stable +0.5%, VIX 22.4)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"Fed balance sheet stable (+0.5%)" = no active tightening' },
      { color: '#f5c842', text: '"VIX 22.4 (elevated)" = above-average volatility, nervous market' },
      { color: '#f25c5c', text: '"Fed funds rate falling" = rates declining = positive for growth stocks' },
    ],
    tip: 'VIX below 15 = calm. 15-25 = normal. 25-35 = fear. Above 35 = panic. Currently at 22.4: elevated but not panic.',
  },
  {
    id: 'options', name: 'OptionsAgent', abbr: 'OP',
    color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', weight: '6%',
    tagline: 'Spies on the derivatives market',
    category: ['active'],
    analogy: 'Like watching where the big players place their bets on derivatives. Max pain is where the price "wants" to go to cause the most losses for the largest number of options holders.',
    desc: 'Analyzes put/call ratio, max pain, and implied volatility. The put/call ratio measures how many bearish bets exist relative to bullish ones.',
    stats: [{ label: 'Metric', val: 'PC ratio' }, { label: 'Max Pain', val: 'Calculated' }, { label: 'Weight', val: '6%' }],
    meters: [{ label: 'Influence on final signal', val: 24 }, { label: 'Predictive power OpEx week', val: 80 }],
    signals: [
      { type: 'buy', text: 'PC ratio < 0.7 (more calls than puts), price above max pain' },
      { type: 'sell', text: 'PC ratio > 1.2 (more puts than calls), high short interest' },
      { type: 'hold', text: 'PC ratio 0.7-1.2 (equilibrium)' },
    ],
    interpret: [
      { color: '#22d3a0', text: '"PC ratio 0.812 (neutral)" = balance between bullish and bearish bets' },
      { color: '#fbbf24', text: '"Max Pain $185 (52.8% below)" = price is well above where MMs would cause max losses' },
      { color: '#f472b6', text: '"IV 24.69%" = implied volatility -- the higher it is, the more the market expects large moves' },
    ],
    tip: 'The third week of every month (OpEx week) is the most important: market makers move the price toward max pain.',
  },
  {
    id: 'macro', name: 'MacroAgent', abbr: 'MA',
    color: '#818cf8', bg: 'rgba(129,140,248,0.12)', weight: '4%',
    tagline: 'The macro analyst with access to Claude AI',
    category: ['active','macro'],
    analogy: 'Like an economist who reads geopolitical news, Fed data, and academic literature, then asks an expert (Claude AI) to synthesize everything.',
    desc: 'The only agent that uses Claude API for reasoning. Receives high-relevance geopolitical articles, rate direction (TLT proxy), and research context from arXiv. Produces a qualitative assessment with detailed reasoning.',
    stats: [{ label: 'LLM', val: 'Claude' }, { label: 'Input', val: '3 sources' }, { label: 'Weight', val: '4%' }],
    meters: [{ label: 'Influence on final signal', val: 16 }, { label: 'Reasoning depth', val: 95 }],
    signals: [
      { type: 'buy', text: 'Favorable macro: expanding liquidity, stable geopolitics' },
      { type: 'sell', text: 'Imminent recession, sanctions, energy crisis, monetary tightening' },
      { type: 'hold', text: 'Macro uncertainty -- mixed situation difficult to interpret' },
    ],
    interpret: [
      { color: '#818cf8', text: '"Rate direction: falling" = rates declining, positive for growth and crypto' },
      { color: '#22d3a0', text: '"Integrated insights from 3 arXiv papers" = research context active' },
      { color: '#f5c842', text: '"geo_articles: 2 high, 4 medium" = geopolitical news weighing on context' },
    ],
    tip: 'Low weight (4%) because qualitative judgment is less precise than quantitative signals. But the reasoning is valuable for understanding the context.',
  },
  {
    id: 'meanreversion', name: 'MeanReversionAgent', abbr: 'MR',
    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', weight: '2%',
    tagline: 'Bets on a return to the mean',
    category: ['active','technical'],
    analogy: 'Like betting that a roller coaster that has climbed too high will come back down. Prices tend to revert to their historical average.',
    desc: 'Calculates the z-score (how many standard deviations away from the mean) and Bollinger %B. If the price is too far from the mean, it bets on a reversion.',
    stats: [{ label: 'Metric', val: 'Z-score' }, { label: 'Threshold', val: '+/-2s' }, { label: 'Weight', val: '2%' }],
    meters: [{ label: 'Influence on final signal', val: 8 }, { label: 'Reliability in strong trends', val: 20 }],
    signals: [
      { type: 'buy', text: 'Z-score < -2 (price well below average), %B < 0' },
      { type: 'sell', text: 'Z-score > 2 (price well above average), %B > 1' },
      { type: 'hold', text: 'Price near the average, z-score between -1 and +1' },
    ],
    interpret: [
      { color: '#94a3b8', text: 'Z-score = distance from the mean in "standard deviations". >2 is statistically extreme' },
      { color: '#f5c842', text: 'Works best in sideways markets. In strong trends it can stay extreme for a long time' },
      { color: '#22d3a0', text: 'Weight reduced to 2% because it often conflicts with TechnicalAgent and MomentumAgent' },
    ],
    tip: 'Mean reversion is the opposite of momentum. Both work, but in different situations. The system balances them automatically.',
  },
  {
    id: 'intermarket', name: 'IntermarketAgent', abbr: 'IM',
    color: '#6366f1', bg: 'rgba(99,102,241,0.12)', weight: '4%',
    tagline: 'Reads relationships between different markets',
    category: ['active','macro'],
    analogy: 'Like understanding that when the dollar strengthens, gold tends to fall. All markets are interconnected.',
    desc: 'Implements John Murphy\'s intermarket relationships: strong USD = tech and crypto fall. High bond yields = growth stocks fall. High oil = XOM rises.',
    stats: [{ label: 'Relationships', val: '4 types' }, { label: 'ETF proxy', val: 'UUP/TLT' }, { label: 'Weight', val: '4%' }],
    meters: [{ label: 'Influence on final signal', val: 16 }, { label: 'Usefulness in strong macro contexts', val: 85 }],
    signals: [
      { type: 'buy', text: 'Weak dollar, falling bond yields, falling VIX, strong sector' },
      { type: 'sell', text: 'Strong dollar, high bond yields, rising VIX, weak sector' },
      { type: 'hold', text: 'Conflicting signals across different markets' },
    ],
    interpret: [
      { color: '#6366f1', text: '"Strong USD (+2.1%) = BEARISH for AAPL" = foreign profits worth less in USD' },
      { color: '#22d3a0', text: '"Oil rising = BULLISH for XOM" = Exxon earns more' },
      { color: '#f5c842', text: '"10Y bond yield rising = BEARISH for NVDA" = high rates = future growth worth less today' },
    ],
    tip: 'With the Middle East conflict: oil rises = XOM BULLISH. But USD rises (safe haven) = AAPL/NVDA BEARISH. Everything is connected.',
  },
  {
    id: 'seasonal', name: 'SeasonalAgent', abbr: 'SN',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', weight: '4%',
    tagline: 'Exploits seasonal market patterns',
    category: ['active'],
    analogy: 'Like knowing that end-of-season sales always come in January and July. The market has its own predictable seasonal "sales".',
    desc: 'Recognizes: January Effect, Sell in May, September Effect, Santa Rally, OpEx week, Quarter End rebalancing, Monday Effect.',
    stats: [{ label: 'Effects', val: '9' }, { label: 'Currently active', val: 'Q-End' }, { label: 'Weight', val: '4%' }],
    meters: [{ label: 'Influence on final signal', val: 16 }, { label: 'Historical pattern reliability', val: 65 }],
    signals: [
      { type: 'buy', text: 'January Effect, Santa Rally (Nov-Dec), post-OpEx' },
      { type: 'sell', text: 'Sell in May (May-September), September Effect' },
      { type: 'hold', text: 'Neutral period or conflicting effects (OpEx, Q-end)' },
    ],
    interpret: [
      { color: '#f59e0b', text: '"Quarter End Rebalancing" (currently active) = funds rebalance portfolios at end of March' },
      { color: '#22d3a0', text: '"OpEx Week" (15th-21st of month) = market makers close options positions' },
      { color: '#f25c5c', text: '"September Effect" = historically the worst month of the year for US stocks' },
    ],
    tip: 'We are currently in "Quarter End Rebalancing" -- large funds must rebalance by March 31. Expect more volatility.',
  },
  {
    id: 'institutional', name: 'InstitutionalAgent', abbr: 'IN',
    color: '#10b981', bg: 'rgba(16,185,129,0.1)', weight: '4%',
    tagline: 'Follows institutional "smart money"',
    category: ['active'],
    analogy: 'Like spying on what Berkshire Hathaway, BlackRock, and CEOs do with their own money. If the CEO buys their own stock, they know something you don\'t.',
    desc: 'Reads insider transactions, sector ETF flows (XLK, XLE, IBIT), and institutional ownership. "Smart money" buying = bullish signal.',
    stats: [{ label: 'Source', val: 'yfinance' }, { label: 'Lookback', val: '90 days' }, { label: 'Weight', val: '4%' }],
    meters: [{ label: 'Influence on final signal', val: 16 }, { label: 'Insider signal reliability', val: 70 }],
    signals: [
      { type: 'buy', text: 'Insiders buying, ETF inflows, institutional ownership > 75%' },
      { type: 'sell', text: 'Massive insider selling, ETF outflows, ownership < 30%' },
      { type: 'hold', text: 'No significant transactions or mixed signals' },
    ],
    interpret: [
      { color: '#10b981', text: '"Smart money buying" = bullish news. CEOs risk their own money.' },
      { color: '#f25c5c', text: '"Insiders selling" = could be personal liquidity or a concerning signal' },
      { color: '#f5c842', text: '"ETF XLK inflow (+3.2% 30d)" = money flowing into the tech sector' },
    ],
    tip: 'Insiders can sell for a thousand reasons. But when they buy, it\'s usually because they believe in the stock.',
  },
  {
    id: 'research', name: 'ResearchAgent', abbr: 'RA',
    color: '#ec4899', bg: 'rgba(236,72,153,0.1)', weight: '0%',
    tagline: 'Reads academic papers and synthesizes with AI',
    category: ['support'],
    analogy: 'Like having a PhD in quantitative finance on the team who reads the latest arXiv papers every day and says "does this study support or contradict our signal?"',
    desc: 'Searches arXiv for the latest papers on ML for trading, regime detection, sentiment analysis. Claude API synthesizes the results. Output used by MacroAgent and WeightedVotingAgent (+/-5% confidence).',
    stats: [{ label: 'Source', val: 'arXiv' }, { label: 'Queries', val: '10 preset' }, { label: 'Role', val: 'Context' }],
    meters: [{ label: 'Indirect influence', val: 20 }, { label: 'Context richness', val: 90 }],
    signals: [
      { type: 'buy', text: '"Literature confirms the signal" = confidence +5%' },
      { type: 'sell', text: '"Literature contradicts the signal" = confidence -5%' },
      { type: 'hold', text: 'Mixed or neutral literature = no boost' },
    ],
    interpret: [
      { color: '#ec4899', text: 'Weight 0% = does not vote directly, but modifies other agents\' confidence' },
      { color: '#22d3a0', text: '"3 arXiv papers integrated" = research context active and working' },
      { color: '#a78bfa', text: 'Insights are shown in the Research card on the /agents dashboard' },
    ],
    tip: 'arXiv is free and publishes dozens of financial ML papers every day. The ResearchAgent keeps you updated without reading them manually.',
  },
  {
    id: 'risk', name: 'RiskAgent', abbr: 'RI',
    color: '#f43f5e', bg: 'rgba(244,63,94,0.1)', weight: '0%',
    tagline: 'The guardian: blocks dangerous signals',
    category: ['support'],
    analogy: 'Like a traffic light that doesn\'t tell you where to go, but stops you if you\'re about to cross on red. It doesn\'t decide the signal, but can override it if too risky.',
    desc: 'Calculates the Kelly Criterion for optimal position sizing, evaluates correlation risk between open positions, and acts as the final gate.',
    stats: [{ label: 'Formula', val: 'Kelly 0.5x' }, { label: 'Max pos.', val: '25% cap' }, { label: 'Role', val: 'Gate' }],
    meters: [{ label: 'Veto power', val: 100 }, { label: 'Intervention frequency', val: 30 }],
    signals: [
      { type: 'buy', text: 'Signal passes: confidence > threshold, low correlation, positive Kelly' },
      { type: 'sell', text: 'Signal blocked: negative edge, high correlation, excessive risk' },
      { type: 'hold', text: 'Reduced confidence: Kelly suggests very small position' },
    ],
    interpret: [
      { color: '#f43f5e', text: '"Kelly 8.5% of capital" = don\'t risk more than 8.5% on this trade' },
      { color: '#f5c842', text: '"Positive edge" = the system has historically profited from this type of signal' },
      { color: '#22d3a0', text: '"Win rate 0.55" = the bot is right 55% of the time (initial default)' },
    ],
    tip: 'The Kelly Criterion says: if you have a statistical edge, how much should you risk to maximize capital growth? Usually: less than you think.',
  },
  {
    id: 'exit_strategy', name: 'ExitStrategyAgent', abbr: 'ES',
    color: '#059669', bg: 'rgba(5,150,105,0.1)', weight: '0%',
    tagline: 'The exit planner: calculates SL, TP and trailing stops',
    category: ['support'],
    analogy: 'Like a co-pilot who sets the altitude limits before takeoff. The pilot (WeightedSignalAgent) decides where to fly, the co-pilot decides when to eject if something goes wrong — or when to land if the destination is reached.',
    desc: 'Calculates ATR-14 based stop loss, take profit, and trailing stop levels for every BUY/SELL signal. Adjusts distances by market regime (crisis = wider stops) and confidence (high confidence = tighter stops). Risk-reward ratio ranges from 2.0 to 3.0.',
    stats: [{ label: 'Method', val: 'ATR-14' }, { label: 'R:R', val: '2.0-3.0' }, { label: 'Role', val: 'Exit levels' }],
    meters: [{ label: 'Regime sensitivity', val: 80 }, { label: 'Precision', val: 70 }],
    signals: [
      { type: 'buy', text: 'BUY signal: SL below entry (ATR x regime multiplier), TP above at R:R ratio' },
      { type: 'sell', text: 'SELL signal: SL above entry, TP below — inverted logic for short positions' },
      { type: 'hold', text: 'HOLD: no exit levels calculated (not an actionable signal)' },
    ],
    interpret: [
      { color: '#ef4444', text: '"SL $245.30 (-2.5%)" = if price drops to $245.30, close position to limit loss' },
      { color: '#10b981', text: '"TP $263.70 (+5.0%)" = if price reaches $263.70, take profit and close' },
      { color: '#f59e0b', text: '"Trailing at $255" = once price hits 50% of TP, stop moves to break-even' },
    ],
    tip: 'Regime multipliers: crisis 3.0x (very wide stops), bear 2.5x, neutral 2.0x, bull 1.5x (tight stops). Crypto uses hourly ATR for faster reactivity.',
  },
]

const FILTERS = [
  { key: 'all', label: 'All (15)' },
  { key: 'active', label: 'Active' },
  { key: 'support', label: 'Support' },
  { key: 'news', label: 'News' },
  { key: 'technical', label: 'Technical' },
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>How it works</div>
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>What the signal means</div>
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#6b6b85', margin: '16px 0 10px' }}>How to interpret the data</div>
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
          Trading Bot Guide
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.05, marginBottom: 16, background: 'linear-gradient(135deg, #fff 0%, #a89ff5 60%, #7c6af7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Your team<br />of 14 analysts
        </h1>
        <p style={{ color: '#6b6b85', fontSize: 16, maxWidth: 480, margin: '0 auto 40px', lineHeight: 1.6 }}>
          Each agent analyzes the market from a different perspective. Understand them all and interpret signals like a pro.
        </p>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 500, margin: '0 auto 20px', background: '#12121a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '12px 20px' }}>
          <span style={{ color: '#6b6b85' }}>&#128269;</span>
          <input
            type="text"
            placeholder="Search for an agent..."
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
            No agent found for &quot;{search}&quot;
          </div>
        ) : (
          filtered.map(a => <AgentCard key={a.id} agent={a} />)
        )}
      </div>
    </div>
  )
}
