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


def format_run_message(
    run_number: int,
    signals: list[dict],
    articles_count: int,
    sentiment_count: int,
    new_signals: int,
    duration_minutes: float = 0,
) -> str:
    """
    Formatta il messaggio di notifica post-run.
    signals = lista di dict con keys: ticker, signal, confidence, consensus
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

    msg = (
        f"{alert}\U0001f916 <b>TradingBot Run #{run_number}</b> -- {now}\n"
        f"\n"
        f"\U0001f4ca <b>SEGNALI:</b>\n"
        f"{signals_text}\n"
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


def format_weekly_report(
    ticker_stats: dict,
    total_signals: int,
    best_ticker: str,
    best_hit_rate: float,
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
        f"\n"
        f"\U0001f517 Dashboard: https://creativity-land.vercel.app"
    )
