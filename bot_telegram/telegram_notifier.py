import asyncio
import os
from telegram import Bot
from datetime import datetime

TELEGRAM_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')


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
        for chat_id in chat_ids:
            await bot.send_message(
                chat_id=int(chat_id),
                text=text,
                parse_mode=parse_mode,
            )
        print(f"Telegram: messaggio inviato a {len(chat_ids)} utenti")
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
