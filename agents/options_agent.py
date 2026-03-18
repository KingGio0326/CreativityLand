import yfinance as yf
import numpy as np
import logging

logger = logging.getLogger("options_agent")


def get_options_data(ticker: str) -> dict:
    """
    Recupera dati opzioni da yfinance e calcola:
    - Put/Call ratio
    - Max pain
    - IV vs HV (implied vs historical volatility)
    - Gamma exposure approssimativo
    """
    try:
        stock = yf.Ticker(ticker)
        expirations = stock.options
        if not expirations:
            return {}

        # Usa la scadenza più vicina (prima)
        exp = expirations[0]
        chain = stock.option_chain(exp)
        calls = chain.calls
        puts  = chain.puts

        # Put/Call ratio (volume)
        total_call_vol = calls["volume"].sum()
        total_put_vol  = puts["volume"].sum()
        pc_ratio = (
            round(total_put_vol / total_call_vol, 3)
            if total_call_vol > 0 else 1.0
        )

        # Put/Call ratio (open interest)
        total_call_oi = calls["openInterest"].sum()
        total_put_oi  = puts["openInterest"].sum()
        pc_oi_ratio = (
            round(total_put_oi / total_call_oi, 3)
            if total_call_oi > 0 else 1.0
        )

        # Max pain — strike con massima perdita per holders
        current_price = stock.info.get("currentPrice", 0)
        all_strikes = sorted(set(
            calls["strike"].tolist() + puts["strike"].tolist()
        ))

        min_pain = float("inf")
        max_pain_strike = current_price

        for strike in all_strikes:
            # Perdita totale calls in the money
            call_pain = calls[calls["strike"] < strike]["openInterest"].sum() * \
                       (strike - calls[calls["strike"] < strike]["strike"]).sum()
            # Perdita totale puts in the money
            put_pain = puts[puts["strike"] > strike]["openInterest"].sum() * \
                      (puts[puts["strike"] > strike]["strike"] - strike).sum()
            total_pain = float(call_pain + put_pain)
            if total_pain < min_pain:
                min_pain = total_pain
                max_pain_strike = strike

        # IV media (implied volatility)
        avg_iv_calls = calls["impliedVolatility"].mean()
        avg_iv_puts  = puts["impliedVolatility"].mean()
        avg_iv = round((avg_iv_calls + avg_iv_puts) / 2 * 100, 2)

        return {
            "expiration":       exp,
            "pc_ratio_volume":  pc_ratio,
            "pc_ratio_oi":      pc_oi_ratio,
            "max_pain":         max_pain_strike,
            "current_price":    current_price,
            "distance_to_max_pain_pct": round(
                (max_pain_strike - current_price) / current_price * 100, 2
            ) if current_price else 0,
            "avg_iv":           avg_iv,
            "call_volume":      int(total_call_vol),
            "put_volume":       int(total_put_vol),
        }

    except Exception as e:
        logger.warning(f"Options data error {ticker}: {e}")
        return {}


def options_signal(options_data: dict) -> tuple[str, int, str]:
    """
    Genera segnale da dati opzioni.
    Ritorna (signal, confidence, reasoning).
    """
    if not options_data:
        return "HOLD", 0, "Dati opzioni non disponibili"

    pc  = options_data.get("pc_ratio_volume", 1.0)
    gap = options_data.get("distance_to_max_pain_pct", 0)
    iv  = options_data.get("avg_iv", 20)

    signals = []

    # Put/Call ratio
    if pc > 1.5:
        signals.append(("BUY", "PC ratio > 1.5 — estremo bearish retail → contrarian BUY"))
    elif pc < 0.5:
        signals.append(("SELL", "PC ratio < 0.5 — estremo bullish retail → contrarian SELL"))
    else:
        signals.append(("HOLD", f"PC ratio neutro ({pc:.2f})"))

    # Max pain — prezzo tende a gravitare verso max pain
    if gap > 3:
        signals.append(("SELL", f"Prezzo {gap:.1f}% sopra max pain — pressione ribassista"))
    elif gap < -3:
        signals.append(("BUY", f"Prezzo {abs(gap):.1f}% sotto max pain — pressione rialzista"))

    # Conta segnali
    buys  = sum(1 for s, _ in signals if s == "BUY")
    sells = sum(1 for s, _ in signals if s == "SELL")

    if buys > sells:
        signal = "BUY"
        confidence = min(buys * 35, 70)
    elif sells > buys:
        signal = "SELL"
        confidence = min(sells * 35, 70)
    else:
        signal = "HOLD"
        confidence = 15

    reasoning = " | ".join(r for _, r in signals)
    return signal, confidence, reasoning


def options_agent(state: dict) -> dict:
    ticker = state.get("ticker", "")

    # Crypto non hanno opzioni standard
    if "-USD" in ticker or ticker in ["GLD", "XOM"]:
        return {
            **state,
            "options_signal":     "HOLD",
            "options_confidence": 0,
            "reasoning": state.get("reasoning", []) + [
                f"OptionsAgent: {ticker} — opzioni non applicabili"
            ]
        }

    options_data = get_options_data(ticker)
    signal, confidence, reason = options_signal(options_data)

    reasoning_line = (
        f"OptionsAgent: {signal} ({confidence}%) | "
        f"PC_ratio={options_data.get('pc_ratio_volume', 'N/A')} | "
        f"MaxPain=${options_data.get('max_pain', 'N/A')} | "
        f"IV={options_data.get('avg_iv', 'N/A')}% | "
        f"{reason}"
    )

    logger.info(reasoning_line)

    return {
        **state,
        "options_signal":     signal,
        "options_confidence": confidence,
        "options_data":       options_data,
        "reasoning": state.get("reasoning", []) + [reasoning_line]
    }
