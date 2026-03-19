"""Extract and store normalized price patterns with market regime detection."""

import logging
import os
import time
from datetime import datetime, timedelta

import numpy as np
import yfinance as yf
from dotenv import load_dotenv
from scipy.signal import resample
from supabase import create_client

load_dotenv()
logger = logging.getLogger("pattern_extractor")

# --- CONFIGURAZIONE TICKER ---
TICKER_START_DATES = {
    # Benchmark di mercato (storia massima)
    "SPY": "1993-01-29",
    "QQQ": "1999-03-10",
    # Mega cap US
    "AAPL": "1980-12-12",
    "MSFT": "1986-03-13",
    "NVDA": "1999-01-22",
    "TSLA": "2010-06-29",
    "AMZN": "1997-05-15",
    # Settoriali per regime detection
    "XLF": "1998-12-22",  # Financial (2008 crisis)
    "GLD": "2004-11-18",  # Gold (safe haven)
    "TLT": "2002-07-30",  # Long bonds (rate crisis)
    # Crypto
    "BTC-USD": "2014-09-17",
    "ETH-USD": "2017-11-09",
}

# --- CRISI STORICHE DA OVERSAMPLIARE ---
CRISIS_PERIODS = [
    ("2000-03-01", "2002-10-31", "dot_com_crash"),
    ("2007-10-01", "2009-03-31", "financial_crisis"),
    ("2010-05-01", "2010-06-30", "flash_crash"),
    ("2011-07-01", "2011-10-31", "eu_debt_crisis"),
    ("2015-08-01", "2016-02-29", "china_selloff"),
    ("2018-09-01", "2018-12-31", "rate_hike_fear"),
    ("2020-02-01", "2020-05-31", "covid_crash"),
    ("2022-01-01", "2022-12-31", "inflation_bear"),
]


def get_seasonal_features(date) -> dict:
    """Ritorna features stagionali per una data."""
    month = date.month
    day_of_week = date.weekday()  # 0=lunedì, 4=venerdì
    day_of_month = date.day
    quarter = (month - 1) // 3 + 1

    # Effetti stagionali noti
    is_january_effect = month == 1
    is_sell_in_may = month in [5, 6, 7, 8, 9]  # maggio-settembre
    is_santa_rally = month in [11, 12]
    is_opex_week = 15 <= day_of_month <= 21
    is_quarter_end = month in [3, 6, 9, 12] and day_of_month >= 25
    is_monday_effect = day_of_week == 0

    return {
        "month": month / 12.0,
        "quarter": quarter / 4.0,
        "is_january_effect": float(is_january_effect),
        "is_sell_in_may": float(is_sell_in_may),
        "is_santa_rally": float(is_santa_rally),
        "is_opex_week": float(is_opex_week),
        "is_quarter_end": float(is_quarter_end),
        "is_monday_effect": float(is_monday_effect),
    }


def is_crisis_date(date) -> tuple[bool, str]:
    """Controlla se una data e in un periodo di crisi."""
    date_str = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)
    for start, end, name in CRISIS_PERIODS:
        if start <= date_str <= end:
            return True, name
    return False, ""


def detect_market_regime(spy_prices: np.ndarray, current_idx: int) -> dict:
    """
    Calcola il regime di mercato usando:
    - MA200 (trend direction)
    - Volatilita 30gg (proxy VIX)
    - Rendimento 30gg (momentum)
    """
    if current_idx < 200:
        return {"regime": "unknown", "vix_approx": None, "spy_trend_30d": None}

    window_prices = spy_prices[max(0, current_idx - 200) : current_idx + 1]
    ma200 = np.mean(window_prices[-200:])
    current_price = window_prices[-1]

    # Volatilita 30gg come proxy VIX
    if len(window_prices) >= 30:
        returns_30d = np.diff(np.log(window_prices[-31:]))
        vix_approx = float(np.std(returns_30d) * np.sqrt(252) * 100)
    else:
        vix_approx = 20.0

    # Trend 30gg
    if current_idx >= 30:
        price_30d_ago = spy_prices[current_idx - 30]
        spy_trend_30d = float(
            (current_price - price_30d_ago) / price_30d_ago * 100
        )
    else:
        spy_trend_30d = 0.0

    # Regime basato su MA200 + volatilita
    above_ma200 = current_price > ma200
    high_vol = vix_approx > 25

    if above_ma200 and not high_vol:
        regime = "bull"
    elif not above_ma200 and high_vol:
        regime = "bear"
    elif not above_ma200 and not high_vol:
        regime = "sideways"
    else:
        regime = "volatile_bull"

    return {
        "regime": regime,
        "vix_approx": round(vix_approx, 2),
        "spy_trend_30d": round(spy_trend_30d, 2),
    }


class PatternExtractor:

    def __init__(self):
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        self._spy_cache = None
        self._spy_dates_cache = None

    def _load_spy_data(self):
        """Carica SPY una volta sola per calcolare regime."""
        if self._spy_cache is None:
            df = yf.download(
                "SPY",
                start="1993-01-29",
                end=datetime.now().strftime("%Y-%m-%d"),
                progress=False,
                auto_adjust=True,
            )
            if not df.empty:
                self._spy_cache = df["Close"].values.flatten()
                self._spy_dates_cache = df.index
        return self._spy_cache, self._spy_dates_cache

    def normalize_pattern(self, prices: np.ndarray) -> list[float]:
        """Normalizza prezzi a rendimenti % e resample a 30 punti."""
        prices = prices.flatten()
        base = prices[0]
        if base == 0:
            return [0.0] * 30
        returns = (prices - base) / base
        normalized = resample(returns, 30)
        return [round(float(x), 6) for x in normalized]

    def build_historical_patterns(self, ticker: str) -> int:
        """Download historical data and save all 30-day patterns with outcomes."""
        start_date = TICKER_START_DATES.get(
            ticker,
            (datetime.now() - timedelta(days=365 * 20)).strftime("%Y-%m-%d"),
        )

        logger.info(f"{ticker}: scaricando dati dal {start_date}...")

        df = yf.download(
            ticker,
            start=start_date,
            end=datetime.now().strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )

        if df.empty or len(df) < 35:
            logger.warning(f"{ticker}: dati insufficienti")
            return 0

        closes = df["Close"].values.flatten()
        dates = df.index

        # Carica SPY per calcolo regime
        spy_prices, spy_dates = self._load_spy_data()

        # Controlla pattern gia esistenti
        existing = (
            self.supabase.table("price_patterns")
            .select("id", count="exact")
            .eq("ticker", ticker)
            .execute()
        )
        existing_count = existing.count or 0

        if existing_count > 500:
            logger.info(f"{ticker}: gia {existing_count} pattern, skip")
            return 0

        window = 30
        batch = []
        saved = 0

        for i in range(0, len(closes) - window - 20):
            current_date = dates[i + window - 1]

            # Step intelligente: 1 nelle crisi, 3 nel normale
            in_crisis, crisis_name = is_crisis_date(current_date)
            step_size = 1 if in_crisis else 3

            if i % step_size != 0:
                continue

            pattern = closes[i : i + window]
            if len(pattern) < window:
                continue

            norm = self.normalize_pattern(pattern)

            start_d = dates[i].date().isoformat()
            end_d = current_date.date().isoformat()

            # Calcola outcome
            end_price = closes[i + window - 1]

            def outcome(n, _i=i, _end_price=end_price):
                idx = _i + window + n - 1
                if idx >= len(closes):
                    return None
                return round(float((closes[idx] - _end_price) / _end_price * 100), 4)

            # Calcola regime di mercato
            regime_data = {
                "regime": "unknown",
                "vix_approx": None,
                "spy_trend_30d": None,
            }

            if spy_prices is not None and spy_dates is not None:
                # Trova indice SPY piu vicino alla data corrente
                spy_idx = None
                for j, sd in enumerate(spy_dates):
                    if sd >= current_date:
                        spy_idx = j
                        break
                if spy_idx and spy_idx >= 200:
                    regime_data = detect_market_regime(spy_prices, spy_idx)

            seasonal = get_seasonal_features(current_date)

            batch.append(
                {
                    "ticker": ticker,
                    "start_date": start_d,
                    "end_date": end_d,
                    "pattern_vector": norm,
                    "outcome_5d": outcome(5),
                    "outcome_10d": outcome(10),
                    "outcome_20d": outcome(20),
                    "market_regime": regime_data["regime"],
                    "vix_approx": regime_data["vix_approx"],
                    "spy_trend_30d": regime_data["spy_trend_30d"],
                    "is_crisis": in_crisis,
                    "month": seasonal["month"],
                    "quarter": seasonal["quarter"],
                    "is_january_effect": seasonal["is_january_effect"],
                    "is_sell_in_may": seasonal["is_sell_in_may"],
                    "is_santa_rally": seasonal["is_santa_rally"],
                    "is_opex_week": seasonal["is_opex_week"],
                    "is_quarter_end": seasonal["is_quarter_end"],
                }
            )

            # Batch insert ogni 500 righe
            if len(batch) >= 500:
                self.supabase.table("price_patterns").upsert(batch).execute()
                saved += len(batch)
                batch = []
                logger.info(f"{ticker}: salvati {saved} pattern...")
                time.sleep(0.3)

        # Insert rimanenti
        if batch:
            self.supabase.table("price_patterns").upsert(batch).execute()
            saved += len(batch)

        logger.info(f"{ticker}: totale {saved} pattern salvati")
        return saved

    def get_current_pattern(self, ticker: str) -> dict | None:
        """Get the current 30-day normalized pattern for a ticker."""
        df = yf.download(
            ticker,
            start=(datetime.now() - timedelta(days=45)).strftime("%Y-%m-%d"),
            end=datetime.now().strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True,
        )
        if df.empty or len(df) < 30:
            return None

        prices = df["Close"].values.flatten()[-30:]
        dates = [d.strftime("%Y-%m-%d") for d in df.index[-30:]]
        norm = self.normalize_pattern(prices)

        # Regime corrente
        spy_prices, spy_dates = self._load_spy_data()
        regime_data = {"regime": "unknown"}
        if spy_prices is not None:
            regime_data = detect_market_regime(spy_prices, len(spy_prices) - 1)

        return {
            "ticker": ticker,
            "prices": prices.tolist(),
            "dates": dates,
            "normalized": norm,
            "current_price": float(prices[-1]),
            "change_30d_pct": round(
                float((prices[-1] - prices[0]) / prices[0] * 100), 2
            ),
            "market_regime": regime_data["regime"],
            "vix_approx": regime_data.get("vix_approx"),
            "spy_trend_30d": regime_data.get("spy_trend_30d"),
        }


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    pe = PatternExtractor()
    tickers = list(TICKER_START_DATES.keys())

    print(f"Build pattern per {len(tickers)} ticker...")
    print("Stima pattern per ticker:")
    for t, start in TICKER_START_DATES.items():
        days = (datetime.now() - datetime.strptime(start, "%Y-%m-%d")).days
        trading = int(days * 0.71)
        crisis_days = sum(
            int(
                (
                    datetime.strptime(e, "%Y-%m-%d")
                    - datetime.strptime(s, "%Y-%m-%d")
                ).days
                * 0.71
            )
            for s, e, _ in CRISIS_PERIODS
            if s >= start
        )
        normal_days = trading - crisis_days
        est = crisis_days + (normal_days // 3)
        print(
            f"  {t:12}: ~{est:,} pattern "
            f"({crisis_days} crisi + {normal_days // 3} normali)"
        )

    total = 0
    for ticker in tickers:
        n = pe.build_historical_patterns(ticker)
        print(f"{ticker}: +{n} pattern salvati")
        total += n

    print(f"\nTotale: {total:,} pattern storici")
    print(f"Spazio stimato: ~{total * 270 / 1024 / 1024:.1f} MB")
