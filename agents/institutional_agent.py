import logging

from engine.institutional_client import (
    get_insider_transactions,
    get_institutional_ownership_change,
    get_etf_flows,
)

logger = logging.getLogger("institutional_agent")


def institutional_agent(state: dict) -> dict:
    ticker = state.get("ticker", "")

    # Recupera dati
    insider = get_insider_transactions(ticker, days_back=90)
    ownership = get_institutional_ownership_change(ticker)
    etf_flows = get_etf_flows(ticker)

    signals = []
    details = []

    # Insider signal
    insider_signal = insider.get("signal", "NEUTRAL")
    buy_count = insider.get("buy_count", 0)
    sell_count = insider.get("sell_count", 0)
    net_shares = insider.get("net_shares", 0)

    if insider_signal == "BULLISH":
        signals.append("BULLISH")
        details.append(
            f"Insider: {buy_count} acquisti vs {sell_count} vendite "
            f"(net +{net_shares:,} azioni)"
        )
    elif insider_signal == "BEARISH":
        signals.append("BEARISH")
        details.append(
            f"Insider: {sell_count} vendite vs {buy_count} acquisti "
            f"(net {net_shares:,} azioni)"
        )

    # ETF flow signal
    etf_flow = etf_flows.get("etf_flow", "unknown")
    etf_return = etf_flows.get("etf_return_30d", 0)
    etf_symbol = etf_flows.get("etf_symbol", "")

    if etf_flow == "inflow":
        signals.append("BULLISH")
        details.append(
            f"ETF {etf_symbol}: inflow ({etf_return:+.1f}% 30d)"
        )
    elif etf_flow == "outflow":
        signals.append("BEARISH")
        details.append(
            f"ETF {etf_symbol}: outflow ({etf_return:+.1f}% 30d)"
        )

    # Ownership istituzionale
    inst_pct = ownership.get("institutional_pct")
    if inst_pct is not None:
        if inst_pct > 75:
            signals.append("BULLISH")
            details.append(
                f"Ownership istituzionale alta: {inst_pct:.1f}%"
            )
        elif inst_pct < 30:
            signals.append("BEARISH")
            details.append(
                f"Ownership istituzionale bassa: {inst_pct:.1f}%"
            )

    # Aggrega
    bullish = signals.count("BULLISH")
    bearish = signals.count("BEARISH")
    total = len(signals)

    if total == 0 or (bullish == 0 and bearish == 0):
        signal = "HOLD"
        confidence = 0
    elif bullish > bearish:
        signal = "BUY"
        confidence = min(int((bullish / total) * 65), 65)
    elif bearish > bullish:
        signal = "SELL"
        confidence = min(int((bearish / total) * 65), 65)
    else:
        signal = "HOLD"
        confidence = 15

    reasoning_line = (
        f"InstitutionalAgent: {signal} ({confidence}%) | "
        f"Insider: {insider_signal} | ETF: {etf_flow} | "
        + " | ".join(details[:2])
    )

    logger.info(reasoning_line)

    return {
        **state,
        "institutional_signal": signal,
        "institutional_confidence": confidence,
        "institutional_data": {
            "insider": insider,
            "ownership": ownership,
            "etf_flows": etf_flows,
        },
        "reasoning": state.get("reasoning", []) + [reasoning_line],
    }
