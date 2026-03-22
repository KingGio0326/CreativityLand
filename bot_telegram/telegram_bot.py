import json
import os
from datetime import datetime, timedelta

from supabase import create_client
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
TELEGRAM_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
ALLOWED_CHAT_ID = int(os.getenv('TELEGRAM_CHAT_ID', '0'))

supabase = create_client(SUPABASE_URL or '', SUPABASE_KEY or '')


def check_auth(update: Update) -> bool:
    """Accetta solo messaggi dal tuo chat ID."""
    return update.effective_chat.id == ALLOWED_CHAT_ID


async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return
    await update.message.reply_text(
        "\U0001f916 <b>TradingBot</b> -- Comandi disponibili:\n\n"
        "/status -- Ultimo run e segnali attivi\n"
        "/signal TICKER -- Dettaglio segnale (es. /signal BTC-USD)\n"
        "/performance -- Hit rate per orizzonte\n"
        "/patterns TICKER -- Top pattern match\n"
        "/agents -- Lista agenti con pesi\n"
        "/report -- Report settimanale\n"
        "/help -- Questo messaggio",
        parse_mode='HTML',
    )


async def cmd_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return

    cutoff = (datetime.now() - timedelta(hours=7)).isoformat()
    result = (
        supabase.table('signals')
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', desc=True)
        .execute()
    )

    signals = result.data or []

    if not signals:
        await update.message.reply_text(
            "\u26a0\ufe0f Nessun segnale recente trovato."
        )
        return

    seen = {}
    for s in signals:
        t = s.get('ticker')
        if t not in seen:
            seen[t] = s

    def sig_emoji(s):
        if s == 'BUY':
            return '\U0001f7e2'
        if s == 'SELL':
            return '\U0001f534'
        return '\u26aa'

    lines = []
    for ticker, s in sorted(seen.items()):
        signal = s.get('signal', 'HOLD')
        conf = s.get('confidence', 0)
        conf_pct = int(conf * 100) if conf <= 1 else int(conf)
        consensus = s.get('consensus_level', 'weak')
        ts = s.get('created_at', '')[:16].replace('T', ' ')
        lines.append(
            f"{sig_emoji(signal)} <b>{ticker}</b>: {signal} "
            f"({conf_pct}%) -- {consensus}\n"
            f"   <i>{ts} UTC</i>"
        )

    msg = "\U0001f4ca <b>Segnali attuali:</b>\n\n" + '\n\n'.join(lines)
    msg += (
        "\n\n\U0001f517 "
        "<a href='https://creativity-land.vercel.app'>Dashboard</a>"
    )
    await update.message.reply_text(msg, parse_mode='HTML')


async def cmd_signal(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return

    args = ctx.args
    if not args:
        await update.message.reply_text(
            "Uso: /signal TICKER (es. /signal BTC-USD)"
        )
        return

    ticker = args[0].upper()

    result = (
        supabase.table('signals')
        .select('*')
        .eq('ticker', ticker)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    )

    if not result.data:
        await update.message.reply_text(
            f"\u274c Nessun segnale trovato per {ticker}"
        )
        return

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

    reasoning_text = ''
    if reasoning:
        top3 = reasoning[:3]
        reasoning_text = '\n'.join(f"\u2022 {r}" for r in top3)

    def sig_emoji(sig):
        if sig == 'BUY':
            return '\U0001f7e2'
        if sig == 'SELL':
            return '\U0001f534'
        return '\u26aa'

    msg = (
        f"{sig_emoji(signal)} <b>{ticker} -- {signal}</b>\n\n"
        f"\U0001f4ca Confidence: <b>{conf_pct}%</b>\n"
        f"\U0001f3af Consensus: <b>{consensus}</b>\n"
        f"\U0001f550 Aggiornato: {ts} UTC\n\n"
        f"<b>Reasoning:</b>\n"
        f"{reasoning_text if reasoning_text else 'Non disponibile'}\n\n"
        f"\U0001f517 <a href='https://creativity-land.vercel.app/patterns'>"
        f"Vedi pattern</a>"
    )

    await update.message.reply_text(msg, parse_mode='HTML')


async def cmd_performance(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return

    tickers = [
        'AAPL', 'TSLA', 'NVDA', 'BTC-USD',
        'ETH-USD', 'MSFT', 'XOM', 'GLD',
    ]
    lines = []

    for ticker in tickers:
        result = (
            supabase.table('signal_evaluations')
            .select('score_168h, score_72h, score_24h, signal_type')
            .eq('ticker', ticker)
            .neq('signal_type', 'HOLD')
            .execute()
        )

        evals = result.data or []
        scores = [
            e['score_168h'] or e['score_72h'] or e['score_24h']
            for e in evals
            if (e['score_168h'] or e['score_72h'] or e['score_24h'])
            is not None
        ]

        if not scores:
            lines.append(f"\u26aa <b>{ticker}</b>: in attesa dati")
            continue

        correct = sum(1 for s in scores if s > 0)
        hit_rate = correct / len(scores) * 100
        if hit_rate >= 60:
            emoji = '\U0001f7e2'
        elif hit_rate >= 50:
            emoji = '\U0001f7e1'
        else:
            emoji = '\U0001f534'
        lines.append(
            f"{emoji} <b>{ticker}</b>: {hit_rate:.0f}% "
            f"({len(scores)} segnali)"
        )

    msg = "\U0001f4c8 <b>Performance Bot:</b>\n\n" + '\n'.join(lines)
    msg += (
        "\n\n\U0001f517 <a href='https://creativity-land.vercel.app/"
        "performance'>Dashboard completa</a>"
    )
    await update.message.reply_text(msg, parse_mode='HTML')


async def cmd_patterns(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return

    args = ctx.args
    ticker = args[0].upper() if args else 'AAPL'

    result = (
        supabase.table('price_patterns')
        .select('start_date, similarity, outcome_5d, outcome_10d')
        .eq('ticker', ticker)
        .order('similarity', desc=True)
        .limit(3)
        .execute()
    )

    patterns = result.data or []

    if not patterns:
        await update.message.reply_text(
            f"\u274c Nessun pattern trovato per {ticker}"
        )
        return

    lines = []
    for i, p in enumerate(patterns, 1):
        sim = p.get('similarity', 0)
        date = p.get('start_date', '')[:10]
        out5 = p.get('outcome_5d', 0) or 0
        out10 = p.get('outcome_10d', 0) or 0
        emoji5 = '\U0001f7e2' if out5 > 0 else '\U0001f534'
        emoji10 = '\U0001f7e2' if out10 > 0 else '\U0001f534'
        lines.append(
            f"#{i} Sim: <b>{sim:.1%}</b> -- {date}\n"
            f"   {emoji5} 5gg: {out5:+.1f}% | "
            f"{emoji10} 10gg: {out10:+.1f}%"
        )

    msg = f"\U0001f50d <b>Top 3 Pattern -- {ticker}:</b>\n\n"
    msg += '\n\n'.join(lines)
    msg += (
        f"\n\n\U0001f517 <a href='https://creativity-land.vercel.app/"
        f"patterns'>Vedi overlay</a>"
    )
    await update.message.reply_text(msg, parse_mode='HTML')


async def cmd_agents(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not check_auth(update):
        return

    agents_info = [
        ('SentimentAgent', '22%'),
        ('FundamentalAgent', '18%'),
        ('MomentumAgent', '12%'),
        ('TechnicalAgent', '11%'),
        ('MLPredictionAgent', '11%'),
        ('LiquidityAgent', '8%'),
        ('OptionsAgent', '6%'),
        ('MacroAgent', '4%'),
        ('IntermarketAgent', '4%'),
        ('SeasonalAgent', '4%'),
        ('InstitutionalAgent', '4%'),
        ('MeanReversionAgent', '2%'),
    ]

    lines = [
        f"\u2022 <b>{name}</b> -- {weight}" for name, weight in agents_info
    ]
    msg = "\U0001f916 <b>Agenti attivi (12):</b>\n\n" + '\n'.join(lines)
    msg += (
        "\n\n\U0001f517 <a href='https://creativity-land.vercel.app/"
        "agents'>Dettaglio dashboard</a>"
    )
    await update.message.reply_text(msg, parse_mode='HTML')


async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await cmd_start(update, ctx)


def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('help', cmd_help))
    app.add_handler(CommandHandler('status', cmd_status))
    app.add_handler(CommandHandler('signal', cmd_signal))
    app.add_handler(CommandHandler('performance', cmd_performance))
    app.add_handler(CommandHandler('patterns', cmd_patterns))
    app.add_handler(CommandHandler('agents', cmd_agents))
    print("Bot Telegram avviato...")
    app.run_polling()


if __name__ == '__main__':
    main()
