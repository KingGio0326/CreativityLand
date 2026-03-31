import asyncio
import os
from telegram import Bot
from datetime import datetime

TELEGRAM_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')


MAX_MSG_LEN = 4096


def _split_message(text: str, limit: int = MAX_MSG_LEN) -> list[str]:
    """Split a long message into chunks that fit Telegram's limit."""
    if len(text) <= limit:
        return [text]
    chunks = []
    while text:
        if len(text) <= limit:
            chunks.append(text)
            break
        # Find last newline before the limit
        cut = text.rfind('\n', 0, limit)
        if cut <= 0:
            cut = limit
        chunks.append(text[:cut])
        text = text[cut:].lstrip('\n')
    return chunks


async def send_message(text: str, parse_mode: str = 'HTML') -> None:
    if not TELEGRAM_TOKEN:
        print("Telegram non configurato, skip notifica")
        return

    chat_ids_raw = os.getenv('TELEGRAM_CHAT_IDS', '') or os.getenv(
        'TELEGRAM_CHAT_ID', ''
    )
    chat_ids = [
        x.strip() for x in chat_ids_raw.split(',') if x.strip().isdigit()
    ]

    if not chat_ids:
        print("Telegram: nessun CHAT_ID configurato, skip notifica")
        return

    try:
        bot = Bot(token=TELEGRAM_TOKEN)
        parts = _split_message(text)
        for chat_id in chat_ids:
            for part in parts:
                await bot.send_message(
                    chat_id=int(chat_id),
                    text=part,
                    parse_mode=parse_mode,
                )
        print(f"Telegram: messaggio inviato a {len(chat_ids)} utenti ({len(parts)} parte/i)")
    except Exception as e:
        print(f"Telegram error: {e}")


def notify(text: str) -> None:
    """Wrapper sincrono per chiamare da codice non-async."""
    asyncio.run(send_message(text))


REGIME_EMOJI = {
    'bull': '\U0001f7e2',     # green
    'neutral': '\U0001f7e1',  # yellow
    'bear': '\U0001f534',     # red
    'crisis': '\u26ab',       # black
}

REGIME_MOD_LABELS = {
    'crisis': 'sentiment +50%, macro +100%, momentum -50%',
    'bear': 'sentiment +30%, macro +50%, momentum -30%',
    'bull': 'momentum +30%, ml +20%, fundamental +20%',
}


def _format_regime_header(regime_data: dict | None) -> str:
    """Build the regime header line for run messages."""
    if not regime_data:
        return ''
    regime = regime_data.get('regime', 'neutral')
    conf = regime_data.get('confidence', 0)
    conf_pct = int(conf * 100) if conf <= 1 else int(conf)
    emoji = REGIME_EMOJI.get(regime, '\U0001f7e1')
    vix = regime_data.get('vix_level')
    spy = regime_data.get('spy_trend_30d')

    parts = [f"{emoji} Mercato: <b>{regime.upper()}</b> ({conf_pct}%)"]
    ctx = []
    if vix is not None:
        ctx.append(f"VIX {vix:.1f}")
    if spy is not None:
        ctx.append(f"SPY 30d {spy:+.1f}%")
    if ctx:
        parts.append(' | '.join(ctx))
    return ' -- '.join(parts) + '\n\n'


def format_run_message(
    run_number: int,
    signals: list[dict],
    articles_count: int,
    sentiment_count: int,
    new_signals: int,
    duration_minutes: float = 0,
    regime_data: dict | None = None,
) -> str:
    """
    Formatta il messaggio di notifica post-run.
    signals = lista di dict con keys: ticker, signal, confidence, consensus
    regime_data = dict con keys: regime, confidence, vix_level, spy_trend_30d
    """
    now = datetime.utcnow().strftime('%d/%m %H:%M UTC')

    def sig_emoji(s):
        if s == 'BUY':
            return '\U0001f7e2'
        if s == 'SELL':
            return '\U0001f534'
        return '\u26aa'

    def cons_emoji(c):
        if c == 'strong':
            return '\U0001f525'
        if c == 'moderate':
            return '\U0001f4ca'
        return '\U0001f4a4'

    regime_header = _format_regime_header(regime_data)
    regime_name = (regime_data or {}).get('regime', 'neutral')
    mod_label = REGIME_MOD_LABELS.get(regime_name)

    signal_lines = []
    has_actionable = False
    for s in signals:
        ticker = s.get('ticker', '').ljust(7)
        signal = s.get('signal', 'HOLD')
        conf = (
            int(s.get('confidence', 0) * 100)
            if s.get('confidence', 0) <= 1
            else int(s.get('confidence', 0))
        )
        consensus = s.get('consensus_level', 'weak')
        emoji = sig_emoji(signal)
        cons = cons_emoji(consensus)
        line = f"{emoji} <b>{ticker}</b> -> {signal} ({conf}%) {cons}"
        if signal != 'HOLD' and conf > 50:
            line += ' \u26a0\ufe0f'
            has_actionable = True
        signal_lines.append(line)

        # SL/TP info for actionable signals
        # Support both nested exit_strategy dict and flat DB columns
        exit_data = s.get('exit_strategy') or {}
        sl = exit_data.get('stop_loss') or s.get('stop_loss')
        tp = exit_data.get('take_profit') or s.get('take_profit')
        sl_pct = exit_data.get('sl_percentage') or s.get('sl_percentage')
        tp_pct = exit_data.get('tp_percentage') or s.get('tp_percentage')
        rr = exit_data.get('risk_reward_ratio') or s.get('risk_reward_ratio')
        if signal != 'HOLD' and sl is not None and tp is not None:
            sl_str = f"${sl:.2f}"
            tp_str = f"${tp:.2f}"
            sl_pct_str = f"-{sl_pct:.1f}%" if sl_pct else ""
            tp_pct_str = f"+{tp_pct:.1f}%" if tp_pct else ""
            rr_str = f"{rr:.1f}" if rr else "?"
            signal_lines.append(
                f"\U0001f4cd SL: {sl_str} ({sl_pct_str}) | "
                f"TP: {tp_str} ({tp_pct_str}) | R:R {rr_str}"
            )

    signals_text = '\n'.join(signal_lines)

    alert = (
        '\U0001f6a8 <b>SEGNALE AZIONABILE</b>\n\n' if has_actionable else ''
    )

    # Regime modifier note (compact, one line after signals)
    regime_note = ''
    if mod_label:
        regime_note = (
            f"\n\U0001f4ca Regime {regime_name.upper()}: {mod_label}\n"
        )

    msg = (
        f"{alert}{regime_header}"
        f"\U0001f916 <b>TradingBot Run #{run_number}</b> -- {now}\n"
        f"\n"
        f"\U0001f4ca <b>SEGNALI:</b>\n"
        f"{signals_text}\n"
        f"{regime_note}"
        f"\n"
        f"\U0001f4f0 <b>Stats run:</b>\n"
        f"- Articoli scrappati: {articles_count}\n"
        f"- Sentiment processati: {sentiment_count}\n"
        f"- Nuovi segnali registrati: {new_signals}\n"
        f"\n"
        f"\u23f1 Durata: {duration_minutes:.1f} min"
    )

    return msg


def notify_order_opened(
    ticker: str,
    side: str,
    shares: float,
    price: float,
    allocated: float,
    sl: float | None,
    tp: float | None,
    paper: bool = True,
) -> None:
    """Send Telegram notification when an order is executed."""
    mode = "PAPER" if paper else "LIVE"
    emoji = "\U0001f7e2" if side == "buy" else "\U0001f534"
    sl_str = f"${sl:.2f}" if sl else "N/A"
    tp_str = f"${tp:.2f}" if tp else "N/A"
    msg = (
        f"{emoji} <b>ORDINE {side.upper()}</b> [{mode}]\n\n"
        f"\U0001f4b9 <b>{ticker}</b>\n"
        f"\u2022 Shares: {shares:.4f}\n"
        f"\u2022 Prezzo: ${price:.2f}\n"
        f"\u2022 Allocato: ${allocated:.2f}\n"
        f"\u2022 SL: {sl_str} | TP: {tp_str}\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def notify_order_closed(
    ticker: str,
    side: str,
    entry_price: float,
    exit_price: float,
    shares: float,
    pnl: float,
    close_reason: str,
    paper: bool = True,
) -> None:
    """Send Telegram notification when a position is closed."""
    mode = "PAPER" if paper else "LIVE"
    emoji = "\U0001f7e2" if pnl >= 0 else "\U0001f534"
    pnl_pct = ((exit_price - entry_price) / entry_price * 100) if entry_price else 0
    if side == "short":
        pnl_pct = -pnl_pct
    reason_labels = {
        "signal": "\U0001f4ca Segnale SELL",
        "sl": "\U0001f6d1 Stop Loss",
        "tp": "\U0001f3af Take Profit",
        "trailing": "\U0001f4c9 Trailing Stop",
        "emergency": "\U0001f6a8 Emergency Close",
        "drawdown": "\U0001f4c9 Max Drawdown",
    }
    reason_str = reason_labels.get(close_reason, close_reason)
    msg = (
        f"{emoji} <b>POSIZIONE CHIUSA</b> [{mode}]\n\n"
        f"\U0001f4b9 <b>{ticker}</b>\n"
        f"\u2022 Entry: ${entry_price:.2f} \u2192 Exit: ${exit_price:.2f}\n"
        f"\u2022 Shares: {shares:.4f}\n"
        f"\u2022 P&L: <b>${pnl:+.2f}</b> ({pnl_pct:+.1f}%)\n"
        f"\u2022 Motivo: {reason_str}\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def notify_circuit_breaker(daily_loss_pct: float, action: str = "blocked") -> None:
    """Send Telegram notification when circuit breaker activates."""
    msg = (
        f"\U0001f6a8\U0001f6a8 <b>CIRCUIT BREAKER ATTIVATO</b>\n\n"
        f"\u2022 Perdita giornaliera: <b>{daily_loss_pct:+.1f}%</b>\n"
        f"\u2022 Azione: <b>{action}</b>\n"
        f"\u2022 Nuovi ordini: <b>BLOCCATI</b>\n\n"
        f"\u26a0\ufe0f Il trading resta bloccato fino a domani o reset manuale.\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def notify_emergency_close(positions_closed: int, reason: str = "kill switch") -> None:
    """Send Telegram notification when emergency close is triggered."""
    msg = (
        f"\U0001f6a8 <b>EMERGENCY CLOSE</b>\n\n"
        f"\u2022 Posizioni chiuse: <b>{positions_closed}</b>\n"
        f"\u2022 Motivo: <b>{reason}</b>\n"
        f"\u2022 Trading: <b>DISABILITATO</b>\n\n"
        f"\u26a0\ufe0f Tutti gli ordini cancellati. "
        f"Riabilitare con /start_trading o env TRADING_ENABLED=true.\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def notify_drawdown(
    current_equity: float,
    peak_equity: float,
    drawdown_pct: float,
    positions_closed: int,
) -> None:
    """Send Telegram notification when max drawdown protection triggers."""
    msg = (
        f"\U0001f4c9\U0001f6a8 <b>MAX DRAWDOWN RAGGIUNTO</b>\n\n"
        f"\u2022 Equity attuale: <b>${current_equity:,.2f}</b>\n"
        f"\u2022 Picco equity: <b>${peak_equity:,.2f}</b>\n"
        f"\u2022 Drawdown: <b>{drawdown_pct:.1f}%</b>\n"
        f"\u2022 Posizioni chiuse: <b>{positions_closed}</b>\n\n"
        f"\u26a0\ufe0f Trading disabilitato automaticamente.\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def notify_ratchet(
    ticker: str,
    ratchet_count: int,
    old_sl: float,
    new_sl: float,
    old_tp: float,
    new_tp: float,
    progress_pct: float,
    paper: bool = True,
) -> None:
    """Send Telegram notification when a ratchet is executed."""
    mode = "PAPER" if paper else "LIVE"
    msg = (
        f"\U0001f504 <b>RATCHET #{ratchet_count}</b> [{mode}]\n\n"
        f"\U0001f4b9 <b>{ticker}</b> — avanzamento {progress_pct:.1f}%\n"
        f"\u2022 SL: <b>${old_sl:.4f}</b> \u2192 <b>${new_sl:.4f}</b>\n"
        f"\u2022 TP: <b>${old_tp:.4f}</b> \u2192 <b>${new_tp:.4f}</b>\n"
        f"\n\u23f0 {datetime.utcnow().strftime('%d/%m %H:%M UTC')}"
    )
    notify(msg)


def format_error_message(error: str, step: str) -> str:
    now = datetime.utcnow().strftime('%d/%m %H:%M UTC')
    return (
        f"\u26a0\ufe0f <b>TradingBot -- ERRORE</b> -- {now}\n"
        f"\n"
        f"Step: <code>{step}</code>\n"
        f"Errore: <code>{error[:500]}</code>\n"
        f"\n"
        f"Controlla i log su GitHub Actions."
    )


def _format_regime_weekly(
    regime_stats: list[dict] | None,
    vix_min: float | None = None,
    vix_max: float | None = None,
) -> str:
    """Format regime distribution for the weekly report."""
    if not regime_stats:
        return ''
    total = sum(r.get('cnt', 0) for r in regime_stats)
    if total == 0:
        return ''

    # Dominant regime
    dominant = max(regime_stats, key=lambda r: r.get('cnt', 0))
    dom_regime = dominant.get('regime', '?')
    dom_emoji = REGIME_EMOJI.get(dom_regime, '\U0001f7e1')

    lines = [
        f"\n\U0001f30d <b>Market Regime questa settimana:</b>",
        f"{dom_emoji} Prevalente: <b>{dom_regime.upper()}</b>",
    ]

    # VIX range
    if vix_min is not None and vix_max is not None:
        lines.append(
            f"\U0001f4c9 VIX range: <b>{vix_min:.1f}</b> — <b>{vix_max:.1f}</b>"
        )

    # Distribution
    lines.append("")
    for r in regime_stats:
        regime = r.get('regime', '?')
        cnt = r.get('cnt', 0)
        emoji = REGIME_EMOJI.get(regime, '\U0001f7e1')
        pct = cnt / total * 100
        lines.append(f"{emoji} {regime.upper()}: {cnt} run ({pct:.0f}%)")

    return '\n'.join(lines) + '\n'


def format_weekly_report(
    ticker_stats: dict,
    total_signals: int,
    best_ticker: str,
    best_hit_rate: float,
    regime_stats: list[dict] | None = None,
    vix_min: float | None = None,
    vix_max: float | None = None,
) -> str:
    now = datetime.utcnow().strftime('%d/%m/%Y')

    lines = []
    for ticker, stats in ticker_stats.items():
        hr = stats.get('hit_rate', 0)
        if hr >= 60:
            emoji = '\U0001f7e2'
        elif hr >= 50:
            emoji = '\U0001f7e1'
        else:
            emoji = '\U0001f534'
        lines.append(
            f"{emoji} {ticker}: {hr}% hit rate "
            f"({stats.get('count', 0)} segnali)"
        )

    stats_text = '\n'.join(lines) if lines else 'Dati non ancora disponibili'
    regime_section = _format_regime_weekly(regime_stats, vix_min, vix_max)

    return (
        f"\U0001f4ca <b>Report Settimanale TradingBot</b>\n"
        f"{now}\n"
        f"\n"
        f"<b>Performance per ticker:</b>\n"
        f"{stats_text}\n"
        f"\n"
        f"<b>Totale segnali valutati:</b> {total_signals}\n"
        f"<b>Miglior ticker:</b> {best_ticker} "
        f"({best_hit_rate:.0f}% hit rate)\n"
        f"{regime_section}"
        f"\n"
        f"\U0001f517 Dashboard: https://creativity-land.vercel.app"
    )
