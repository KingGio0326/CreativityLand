from dotenv import load_dotenv
load_dotenv()

import json
import os
from datetime import datetime, timedelta

from supabase import create_client, Client
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, ContextTypes,
)

TELEGRAM_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

ALLOWED_CHAT_IDS = set(
    int(x.strip())
    for x in (
        os.getenv('TELEGRAM_CHAT_IDS', '') or os.getenv('TELEGRAM_CHAT_ID', '')
    ).split(',')
    if x.strip().isdigit()
)

TICKERS = [
    'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOG', 'META',
    'AMD', 'INTC', 'AVGO', 'TSM', 'MU',
    'JPM', 'GS', 'BAC', 'V', 'MA',
    'XOM', 'CVX', 'COP', 'OXY',
    'LMT', 'RTX', 'NOC',
    'JNJ', 'PFE', 'LLY',
    'WMT', 'COST', 'DIS',
    'GLD', 'SPY', 'QQQ', 'XLE', 'XLF', 'SLV', 'USO', 'TLT',
    'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD',
]

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL or '', SUPABASE_KEY or '')
    return _supabase


def check_auth(update: Update) -> bool:
    uid = update.effective_chat.id if update.effective_chat else None
    return uid in ALLOWED_CHAT_IDS


# -- KEYBOARDS ----------------------------------------------------

def main_menu_keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "\U0001f4ca Segnali", callback_data="menu_status"),
            InlineKeyboardButton(
                "\U0001f4c8 Performance", callback_data="menu_performance"),
        ],
        [
            InlineKeyboardButton(
                "\U0001f50d Pattern", callback_data="menu_patterns"),
            InlineKeyboardButton(
                "\U0001f916 Agenti", callback_data="menu_agents"),
        ],
        [
            InlineKeyboardButton(
                "\U0001f30d Regime", callback_data="menu_regime"),
            InlineKeyboardButton(
                "\U0001f4b0 Trading", callback_data="menu_trading"),
        ],
        [
            InlineKeyboardButton(
                "\U0001f517 Dashboard",
                url="https://creativity-land.vercel.app"),
        ],
    ])


def ticker_keyboard(action: str):
    rows = []
    row = []
    for ticker in TICKERS:
        row.append(InlineKeyboardButton(
            ticker, callback_data=f"{action}_{ticker}"))
        if len(row) == 4:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton(
        "\u2b05\ufe0f Menu", callback_data="menu_main")])
    return InlineKeyboardMarkup(rows)


def back_keyboard():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(
            "\u2b05\ufe0f Menu", callback_data="menu_main")],
    ])


def horizon_keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "\u26a1 6h", callback_data="perf_6h"),
            InlineKeyboardButton(
                "\U0001f4c5 24h", callback_data="perf_24h"),
        ],
        [
            InlineKeyboardButton(
                "\U0001f4c6 72h", callback_data="perf_72h"),
            InlineKeyboardButton(
                "\U0001f3c6 7gg", callback_data="perf_168h"),
        ],
        [InlineKeyboardButton(
            "\u2b05\ufe0f Menu", callback_data="menu_main")],
    ])


def horizon_row_keyboard():
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "\u26a1 6h", callback_data="perf_6h"),
            InlineKeyboardButton(
                "\U0001f4c5 24h", callback_data="perf_24h"),
            InlineKeyboardButton(
                "\U0001f4c6 72h", callback_data="perf_72h"),
            InlineKeyboardButton(
                "\U0001f3c6 7gg", callback_data="perf_168h"),
        ],
        [InlineKeyboardButton(
            "\u2b05\ufe0f Menu", callback_data="menu_main")],
    ])


# -- HELPERS DATA --------------------------------------------------

def sig_emoji(s):
    if s == 'BUY':
        return '\U0001f7e2'
    if s == 'SELL':
        return '\U0001f534'
    return '\u26aa'


def get_latest_signals():
    cutoff = (datetime.now() - timedelta(hours=7)).isoformat()
    result = (
        get_supabase().table('signals')
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', desc=True)
        .execute()
    )
    signals = result.data or []
    seen = {}
    for s in signals:
        t = s.get('ticker')
        if t not in seen:
            seen[t] = s
    return seen


def format_status_text(seen: dict) -> str:
    if not seen:
        return "\u26a0\ufe0f Nessun segnale recente (ultimi 7h)"
    lines = []
    for ticker in TICKERS:
        s = seen.get(ticker)
        if not s:
            lines.append(f"\u26aa <b>{ticker}</b>: --")
            continue
        signal = s.get('signal', 'HOLD')
        conf = s.get('confidence', 0)
        conf_pct = int(conf * 100) if conf <= 1 else int(conf)
        consensus = s.get('consensus_level', 'weak')
        lines.append(
            f"{sig_emoji(signal)} <b>{ticker}</b>: "
            f"{signal} ({conf_pct}%) \u00b7 {consensus}"
        )
    return "\U0001f4ca <b>Segnali attuali:</b>\n\n" + '\n'.join(lines)


def _get_regime_line() -> str:
    """Fetch current regime as a compact one-liner."""
    try:
        rr = (
            get_supabase().table('market_regime')
            .select('regime, confidence, vix_level')
            .order('detected_at', desc=True)
            .limit(1)
            .execute()
        )
        if not rr.data:
            return ''
        r = rr.data[0]
        regime = r.get('regime', 'neutral')
        conf = r.get('confidence', 0)
        conf_pct = int(conf * 100) if conf <= 1 else int(conf)
        emoji = REGIME_EMOJI.get(regime, '\U0001f7e1')
        vix = r.get('vix_level')
        vix_part = f" | VIX {vix:.1f}" if vix is not None else ''
        return f"{emoji} Regime: <b>{regime.upper()}</b> ({conf_pct}%){vix_part}\n"
    except Exception:
        return ''


def format_signal_detail(ticker: str) -> str:
    result = (
        get_supabase().table('signals')
        .select('*')
        .eq('ticker', ticker)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return f"\u274c Nessun segnale per {ticker}"
    s = result.data[0]
    signal = s.get('signal', 'HOLD')
    conf = s.get('confidence', 0)
    conf_pct = int(conf * 100) if conf <= 1 else int(conf)
    consensus = s.get('consensus_level', 'weak')
    ts = s.get('created_at', '')[:16].replace('T', ' ')
    reasoning_raw = s.get('reasoning', '[]')
    try:
        reasoning = (
            json.loads(reasoning_raw)
            if isinstance(reasoning_raw, str)
            else reasoning_raw
        )
    except Exception:
        reasoning = []
    top3 = (
        '\n'.join(f"\u2022 {r[:80]}" for r in reasoning[:3])
        if reasoning else 'N/D'
    )
    regime_line = _get_regime_line()
    return (
        f"{sig_emoji(signal)} <b>{ticker} -- {signal}</b>\n\n"
        f"{regime_line}"
        f"\U0001f4ca Confidence: <b>{conf_pct}%</b>\n"
        f"\U0001f3af Consensus: <b>{consensus}</b>\n"
        f"\U0001f550 {ts} UTC\n\n"
        f"<b>Reasoning:</b>\n{top3}"
    )


def format_performance_text(horizon: str) -> str:
    score_key = f"score_{horizon}"
    label = {
        '6h': '6 ore', '24h': '24 ore',
        '72h': '72 ore', '168h': '7 giorni',
    }.get(horizon, horizon)
    lines = []
    for ticker in TICKERS:
        result = (
            get_supabase().table('signal_evaluations')
            .select(f'{score_key}, signal_type')
            .eq('ticker', ticker)
            .neq('signal_type', 'HOLD')
            .execute()
        )
        evals = result.data or []
        scores = [
            e[score_key] for e in evals if e.get(score_key) is not None
        ]
        if not scores:
            lines.append(f"\u26aa <b>{ticker}</b>: in attesa")
            continue
        correct = sum(1 for s in scores if s > 0)
        hr = correct / len(scores) * 100
        if hr >= 60:
            emoji = '\U0001f7e2'
        elif hr >= 50:
            emoji = '\U0001f7e1'
        else:
            emoji = '\U0001f534'
        lines.append(
            f"{emoji} <b>{ticker}</b>: {hr:.0f}% ({len(scores)} segnali)"
        )
    return (
        f"\U0001f4c8 <b>Performance -- {label}:</b>\n\n" + '\n'.join(lines)
    )


def format_patterns_text(ticker: str) -> str:
    try:
        result = (
            get_supabase().table('price_patterns')
            .select('start_date, outcome_5d, outcome_10d, outcome_20d')
            .eq('ticker', ticker)
            .order('start_date', desc=True)
            .limit(3)
            .execute()
        )

        patterns = result.data or []

        if not patterns:
            return f"\u274c Nessun pattern trovato per {ticker}"

        lines = []
        for i, p in enumerate(patterns, 1):
            date = str(p.get('start_date', ''))[:10]
            out5 = float(p.get('outcome_5d') or 0)
            out10 = float(p.get('outcome_10d') or 0)
            e5 = '\U0001f7e2' if out5 > 0 else '\U0001f534'
            e10 = '\U0001f7e2' if out10 > 0 else '\U0001f534'
            lines.append(
                f"#{i} {date}\n"
                f"   {e5} 5gg: {out5:+.1f}% | "
                f"{e10} 10gg: {out10:+.1f}%"
            )

        return (
            f"\U0001f50d <b>Ultimi 3 Pattern -- {ticker}:</b>\n\n"
            + '\n\n'.join(lines)
        )

    except Exception as e:
        return f"\u274c Errore pattern {ticker}: {str(e)[:200]}"


REGIME_EMOJI = {
    'bull': '\U0001f7e2', 'neutral': '\U0001f7e1',
    'bear': '\U0001f534', 'crisis': '\u26ab',
}

REGIME_MOD_LABELS = {
    'crisis': 'sentiment +50%, macro +100%, momentum -50%',
    'bear': 'sentiment +30%, macro +50%, momentum -30%',
    'bull': 'momentum +30%, ml +20%, fundamental +20%',
}


def format_regime_text() -> str:
    try:
        result = (
            get_supabase().table('market_regime')
            .select('*')
            .order('detected_at', desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return "\u274c Nessun dato regime disponibile"
        r = result.data[0]
        regime = r.get('regime', 'neutral')
        conf = r.get('confidence', 0)
        conf_pct = int(conf * 100) if conf <= 1 else int(conf)
        emoji = REGIME_EMOJI.get(regime, '\U0001f7e1')
        vix = r.get('vix_level')
        spy_trend = r.get('spy_trend_30d')
        tlt_trend = r.get('tlt_trend_30d')
        sma50 = r.get('spy_sma50')
        sma200 = r.get('spy_sma200')
        ts = str(r.get('detected_at', ''))[:16].replace('T', ' ')

        lines = [
            f"{emoji} <b>Regime: {regime.upper()}</b> ({conf_pct}%)",
            f"\U0001f550 {ts} UTC",
            "",
            "<b>Indicatori:</b>",
        ]
        if vix is not None:
            vix_tag = ""
            if vix > 35:
                vix_tag = " (ESTREMO)"
            elif vix > 25:
                vix_tag = " (ALTO)"
            elif vix > 18:
                vix_tag = " (MODERATO)"
            else:
                vix_tag = " (BASSO)"
            lines.append(f"\u2022 VIX: <b>{vix:.1f}</b>{vix_tag}")
        if spy_trend is not None:
            lines.append(f"\u2022 SPY 30d: <b>{spy_trend:+.1f}%</b>")
        if tlt_trend is not None:
            lines.append(f"\u2022 TLT 30d: <b>{tlt_trend:+.1f}%</b>")
        if sma50 is not None and sma200 is not None:
            cross = "GOLDEN" if sma50 > sma200 else "DEATH"
            lines.append(
                f"\u2022 SMA Cross: <b>{cross}</b> "
                f"(50={sma50:.0f}, 200={sma200:.0f})"
            )

        mod_label = REGIME_MOD_LABELS.get(regime)
        if mod_label:
            lines.append(f"\n\U0001f4ca <b>Pesi modificati:</b>\n{mod_label}")

        return '\n'.join(lines)
    except Exception as e:
        return f"\u274c Errore regime: {str(e)[:200]}"


def format_trading_text() -> str:
    """Build trading status text with positions and account info."""
    try:
        from engine.executor import TradeExecutor
        executor = TradeExecutor(paper=True)
        summary = executor.get_portfolio_summary()

        if "error" in summary:
            return f"\u274c Errore trading: {summary['error']}"

        equity = summary.get("equity", 0)
        buying_power = summary.get("buying_power", 0)
        cash = summary.get("cash", 0)
        daily_pnl = summary.get("daily_pnl", 0)
        n_pos = summary.get("positions_count", 0)
        enabled = summary.get("trading_enabled", False)
        paper = summary.get("paper", True)

        mode = "PAPER" if paper else "\U0001f534 LIVE"
        status_emoji = "\U0001f7e2" if enabled else "\U0001f534"
        status_text = "ATTIVO" if enabled else "DISATTIVO"
        pnl_emoji = "\U0001f7e2" if daily_pnl >= 0 else "\U0001f534"

        lines = [
            f"\U0001f4b0 <b>Trading Status</b> [{mode}]",
            f"",
            f"{status_emoji} Stato: <b>{status_text}</b>",
            f"\u2022 Equity: <b>${equity:,.2f}</b>",
            f"\u2022 Cash: ${cash:,.2f}",
            f"\u2022 Buying Power: ${buying_power:,.2f}",
            f"{pnl_emoji} P&L giornaliero: <b>${daily_pnl:+,.2f}</b>",
            f"\u2022 Posizioni aperte: <b>{n_pos}</b>",
        ]

        # Fetch open positions detail
        if n_pos > 0:
            positions = executor.get_open_positions()
            lines.append("")
            lines.append("<b>Posizioni:</b>")
            for p in positions[:10]:
                t = p.get("symbol", "?")
                qty = float(p.get("qty", 0))
                entry = float(p.get("avg_entry_price", 0))
                current = float(p.get("current_price", 0))
                upl = float(p.get("unrealized_pl", 0))
                e = "\U0001f7e2" if upl >= 0 else "\U0001f534"
                lines.append(
                    f"{e} <b>{t}</b>: {qty:.4f} @ ${entry:.2f} "
                    f"\u2192 ${current:.2f} (${upl:+.2f})"
                )

        return "\n".join(lines)
    except Exception as e:
        return f"\u274c Errore trading: {str(e)[:200]}"


def format_agents_text() -> str:
    agents = [
        ('SentimentAgent', '22%'), ('FundamentalAgent', '18%'),
        ('MomentumAgent', '12%'), ('TechnicalAgent', '11%'),
        ('MLPredictionAgent', '11%'), ('LiquidityAgent', '8%'),
        ('OptionsAgent', '6%'), ('MacroAgent', '4%'),
        ('IntermarketAgent', '4%'), ('SeasonalAgent', '4%'),
        ('InstitutionalAgent', '4%'), ('MeanReversionAgent', '2%'),
    ]
    lines = [f"\u2022 <b>{n}</b> -- {w}" for n, w in agents]
    return "\U0001f916 <b>Agenti attivi (12):</b>\n\n" + '\n'.join(lines)


# -- HANDLERS ------------------------------------------------------

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return
    await update.message.reply_text(
        "\U0001f916 <b>TradingBot</b> -- Scegli un'opzione:",
        parse_mode='HTML',
        reply_markup=main_menu_keyboard(),
    )


async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await cmd_start(update, ctx)


async def cmd_stop_trading(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Kill switch: close all positions and disable trading."""
    if not check_auth(update):
        return
    try:
        from engine.executor import TradeExecutor
        executor = TradeExecutor(paper=True)
        result = executor.emergency_close_all()
        n = result.get("positions_closed", 0)
        await update.message.reply_text(
            f"\U0001f6a8 <b>EMERGENCY CLOSE</b>\n\n"
            f"\u2022 Posizioni chiuse: <b>{n}</b>\n"
            f"\u2022 Trading: <b>DISABILITATO</b>\n\n"
            f"Usa /start_trading per riabilitare.",
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )
    except Exception as e:
        await update.message.reply_text(
            f"\u274c Errore: {str(e)[:300]}",
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )


async def cmd_start_trading(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Re-enable trading after emergency stop."""
    if not check_auth(update):
        return
    try:
        from engine.executor import TradeExecutor
        executor = TradeExecutor(paper=True)
        executor.enable_trading()
        await update.message.reply_text(
            "\U0001f7e2 <b>Trading RIABILITATO</b>\n\n"
            "Il bot eseguira\u0300 i prossimi segnali.",
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )
    except Exception as e:
        await update.message.reply_text(
            f"\u274c Errore: {str(e)[:300]}",
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )


async def handle_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not query.from_user or query.from_user.id not in ALLOWED_CHAT_IDS:
        return

    data = query.data or ''

    # -- MAIN MENU
    if data == 'menu_main':
        await query.edit_message_text(
            "\U0001f916 <b>TradingBot</b> -- Scegli un'opzione:",
            parse_mode='HTML',
            reply_markup=main_menu_keyboard(),
        )

    # -- SEGNALI: mostra tutti i ticker
    elif data == 'menu_status':
        seen = get_latest_signals()
        text = format_status_text(seen)
        rows = []
        row = []
        for ticker in TICKERS:
            row.append(InlineKeyboardButton(
                ticker, callback_data=f"signal_{ticker}"))
            if len(row) == 4:
                rows.append(row)
                row = []
        if row:
            rows.append(row)
        rows.append([InlineKeyboardButton(
            "\u2b05\ufe0f Menu", callback_data="menu_main")])
        await query.edit_message_text(
            text,
            parse_mode='HTML',
            reply_markup=InlineKeyboardMarkup(rows),
        )

    # -- DETTAGLIO SINGOLO TICKER
    elif data.startswith('signal_'):
        ticker = data.replace('signal_', '')
        text = format_signal_detail(ticker)
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "\U0001f50d Pattern",
                    callback_data=f"pattern_{ticker}"),
                InlineKeyboardButton(
                    "\u2b05\ufe0f Segnali",
                    callback_data="menu_status"),
            ],
            [InlineKeyboardButton(
                "\U0001f3e0 Menu", callback_data="menu_main")],
        ])
        await query.edit_message_text(
            text, parse_mode='HTML', reply_markup=kb)

    # -- PERFORMANCE: scegli orizzonte
    elif data == 'menu_performance':
        await query.edit_message_text(
            "\U0001f4c8 <b>Performance</b> -- Scegli orizzonte:",
            parse_mode='HTML',
            reply_markup=horizon_keyboard(),
        )

    elif data.startswith('perf_'):
        horizon = data.replace('perf_', '')
        text = format_performance_text(horizon)
        await query.edit_message_text(
            text,
            parse_mode='HTML',
            reply_markup=horizon_row_keyboard(),
        )

    # -- PATTERN: scegli ticker
    elif data == 'menu_patterns':
        await query.edit_message_text(
            "\U0001f50d <b>Pattern</b> -- Scegli ticker:",
            parse_mode='HTML',
            reply_markup=ticker_keyboard('pattern'),
        )

    elif data.startswith('pattern_'):
        ticker = data.replace('pattern_', '')
        text = format_patterns_text(ticker)
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "\U0001f4ca Segnale",
                    callback_data=f"signal_{ticker}"),
                InlineKeyboardButton(
                    "\u2b05\ufe0f Pattern",
                    callback_data="menu_patterns"),
            ],
            [InlineKeyboardButton(
                "\U0001f3e0 Menu", callback_data="menu_main")],
        ])
        await query.edit_message_text(
            text, parse_mode='HTML', reply_markup=kb)

    # -- REGIME
    elif data == 'menu_regime':
        text = format_regime_text()
        await query.edit_message_text(
            text,
            parse_mode='HTML',
            reply_markup=back_keyboard(),
        )

    # -- AGENTI
    elif data == 'menu_agents':
        text = format_agents_text()
        await query.edit_message_text(
            text,
            parse_mode='HTML',
            reply_markup=back_keyboard(),
        )

    # -- TRADING STATUS
    elif data == 'menu_trading':
        text = format_trading_text()
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton(
                    "\U0001f534 STOP Trading",
                    callback_data="trading_stop"),
                InlineKeyboardButton(
                    "\U0001f504 Aggiorna",
                    callback_data="menu_trading"),
            ],
            [InlineKeyboardButton(
                "\u2b05\ufe0f Menu", callback_data="menu_main")],
        ])
        await query.edit_message_text(
            text, parse_mode='HTML', reply_markup=kb)

    # -- EMERGENCY STOP (inline button)
    elif data == 'trading_stop':
        try:
            from engine.executor import TradeExecutor
            executor = TradeExecutor(paper=True)
            result = executor.emergency_close_all()
            n = result.get("positions_closed", 0)
            text = (
                f"\U0001f6a8 <b>EMERGENCY CLOSE</b>\n\n"
                f"\u2022 Posizioni chiuse: <b>{n}</b>\n"
                f"\u2022 Trading: <b>DISABILITATO</b>"
            )
        except Exception as e:
            text = f"\u274c Errore: {str(e)[:200]}"
        await query.edit_message_text(
            text, parse_mode='HTML', reply_markup=back_keyboard())


# -- MAIN ----------------------------------------------------------

def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_help))
    app.add_handler(CommandHandler('stop_trading', cmd_stop_trading))
    app.add_handler(CommandHandler('start_trading', cmd_start_trading))
    app.add_handler(CallbackQueryHandler(handle_callback))
    print("Bot Telegram avviato con bottoni inline...")
    app.run_polling(drop_pending_updates=True)


if __name__ == '__main__':
    main()
