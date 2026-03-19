import logging
from datetime import datetime, timedelta

import httpx
import yfinance as yf

logger = logging.getLogger("institutional_client")

SEC_HEADERS = {
    "User-Agent": "TradingBot research@example.com",
    "Accept-Encoding": "gzip, deflate",
}

# CIK dei principali fondi da monitorare
MAJOR_FUNDS = {
    "Berkshire Hathaway": "0001067983",
    "Bridgewater":        "0001350694",
    "Renaissance Tech":   "0001037389",
    "BlackRock":          "0001364742",
    "Vanguard":           "0000102909",
}


def get_recent_13f_holdings(cik: str, fund_name: str) -> list[dict]:
    """
    Recupera le ultime holdings 13F per un fondo da SEC EDGAR.
    Ritorna lista di {fund, filing_date, accession, source}.
    """
    try:
        url = f"https://data.sec.gov/submissions/CIK{cik.zfill(10)}.json"
        resp = httpx.get(url, headers=SEC_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        filings = data.get("filings", {}).get("recent", {})
        forms = filings.get("form", [])
        dates = filings.get("filingDate", [])
        accessions = filings.get("accessionNumber", [])

        # Trova l'ultimo 13F-HR
        for i, form in enumerate(forms):
            if form == "13F-HR":
                filing_date = dates[i]
                accession = accessions[i].replace("-", "")

                logger.info(
                    f"{fund_name}: ultimo 13F del {filing_date}"
                )
                return [{
                    "fund": fund_name,
                    "filing_date": filing_date,
                    "accession": accession,
                    "source": "sec_edgar",
                }]
        return []

    except Exception as e:
        logger.warning(f"SEC Edgar error {fund_name}: {e}")
        return []


def get_insider_transactions(ticker: str, days_back: int = 90) -> dict:
    """
    Recupera transazioni insider da yfinance.
    Ritorna summary di acquisti/vendite recenti.
    """
    try:
        stock = yf.Ticker(ticker)

        # Insider transactions
        transactions = stock.insider_transactions
        if transactions is None or transactions.empty:
            return {"buy_count": 0, "sell_count": 0, "net_shares": 0}

        # Filtra ultimi N giorni
        cutoff = datetime.now() - timedelta(days=days_back)

        # Converti indice a datetime se necessario
        if hasattr(transactions.index, "tz_localize"):
            recent = transactions[transactions.index >= cutoff]
        else:
            recent = transactions

        if recent.empty:
            return {"buy_count": 0, "sell_count": 0, "net_shares": 0}

        # Classifica transazioni
        buy_keywords = ["purchase", "buy", "acquisition", "acquisto"]
        sell_keywords = ["sale", "sell", "disposition", "vendita"]

        buy_count = 0
        sell_count = 0
        net_shares = 0

        for _, row in recent.iterrows():
            text = str(row.get("Transaction", "")).lower()
            shares = abs(int(row.get("Shares", 0) or 0))

            if any(kw in text for kw in buy_keywords):
                buy_count += 1
                net_shares += shares
            elif any(kw in text for kw in sell_keywords):
                sell_count += 1
                net_shares -= shares

        return {
            "buy_count": buy_count,
            "sell_count": sell_count,
            "net_shares": net_shares,
            "signal": (
                "BULLISH" if net_shares > 0
                else "BEARISH" if net_shares < 0
                else "NEUTRAL"
            ),
        }

    except Exception as e:
        logger.warning(f"Insider data error {ticker}: {e}")
        return {"buy_count": 0, "sell_count": 0, "net_shares": 0}


def get_institutional_ownership_change(ticker: str) -> dict:
    """
    Recupera variazione ownership istituzionale da yfinance.
    """
    try:
        stock = yf.Ticker(ticker)

        # Institutional holders
        inst = stock.institutional_holders
        if inst is None or inst.empty:
            return {"change": "unknown", "top_holder": None}

        # Major holders
        major = stock.major_holders
        if major is not None and not major.empty:
            try:
                inst_pct = float(
                    str(major.iloc[1, 0]).replace("%", "")
                )
                return {
                    "institutional_pct": inst_pct,
                    "top_holders": (
                        inst.head(3)["Holder"].tolist()
                        if "Holder" in inst.columns
                        else []
                    ),
                    "change": "available",
                }
            except Exception:
                pass

        return {"change": "unknown", "top_holder": None}

    except Exception as e:
        logger.warning(f"Institutional ownership error {ticker}: {e}")
        return {"change": "unknown", "top_holder": None}


def get_etf_flows(ticker: str) -> dict:
    """
    Stima flussi ETF per settore del ticker.
    Usa performance recente degli ETF settoriali come proxy.
    """
    SECTOR_ETFS = {
        "AAPL": "XLK", "NVDA": "XLK", "MSFT": "XLK", "TSLA": "XLY",
        "XOM": "XLE", "GLD": "GLD",
        "BTC-USD": "IBIT", "ETH-USD": "ETHA",
    }

    etf = SECTOR_ETFS.get(ticker)
    if not etf:
        return {"etf_flow": "unknown"}

    try:
        df = yf.download(
            etf,
            start=(datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )
        if df.empty:
            return {"etf_flow": "unknown"}

        # Volume trend come proxy di flussi
        volumes = df["Volume"].values.flatten()
        avg_volume = volumes.mean()
        recent_volume = volumes[-5:].mean()
        volume_change = (recent_volume - avg_volume) / avg_volume * 100

        prices = df["Close"].values.flatten()
        price_change = (prices[-1] - prices[0]) / prices[0] * 100

        if volume_change > 10 and price_change > 0:
            flow = "inflow"
        elif volume_change > 10 and price_change < 0:
            flow = "outflow"
        else:
            flow = "neutral"

        return {
            "etf_symbol": etf,
            "etf_return_30d": round(float(price_change), 2),
            "volume_change_pct": round(float(volume_change), 2),
            "etf_flow": flow,
        }

    except Exception as e:
        logger.warning(f"ETF flow error {ticker}: {e}")
        return {"etf_flow": "unknown"}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Insider AAPL:", get_insider_transactions("AAPL"))
    print("Institutional AAPL:", get_institutional_ownership_change("AAPL"))
    print("ETF flows AAPL:", get_etf_flows("AAPL"))
