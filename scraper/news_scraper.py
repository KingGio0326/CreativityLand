"""News scraper module for fetching financial news from various sources."""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone

import feedparser
import httpx
from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv()

logger = logging.getLogger("scraper")

# ── Ticker → company/asset name mapping (for filtering general feeds) ──
TICKER_NAMES: dict[str, list[str]] = {
    "AAPL": ["Apple", "AAPL"],
    "TSLA": ["Tesla", "TSLA"],
    "NVDA": ["Nvidia", "NVDA", "Jensen Huang"],
    "MSFT": ["Microsoft", "MSFT"],
    "XOM": ["Exxon", "ExxonMobil", "XOM"],
    "GLD": ["Gold", "GLD", "XAUUSD", "gold price"],
    "BTC-USD": ["Bitcoin", "BTC", "crypto"],
    "ETH-USD": ["Ethereum", "ETH", "Ether"],
}

CRYPTO_TICKERS = {"BTC-USD", "ETH-USD"}

# ── Ticker-specific RSS feeds ──
YAHOO_RSS = "https://finance.yahoo.com/rss/headline?s={ticker}"
GOOGLE_RSS = "https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en"
SEEKING_ALPHA_RSS = "https://seekingalpha.com/api/sa/combined/{ticker}.xml"

# ── General financial RSS feeds (filtered by ticker keywords) ──
GENERAL_RSS = [
    "https://feeds.marketwatch.com/marketwatch/realtimeheadlines/",
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
    "https://www.investing.com/rss/news_301.rss",
    "https://feeds.benzinga.com/benzinga/markets/",
]

# ── Crypto-specific RSS feeds ──
CRYPTO_RSS = [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://cointelegraph.com/rss",
    "https://www.theblock.co/rss.xml",
]

# ── API endpoints ──
NEWSAPI_URL = "https://newsapi.org/v2/everything"
FINNHUB_URL = "https://finnhub.io/api/v1/company-news"
ALPHAVANTAGE_URL = "https://www.alphavantage.co/query"


class NewsScraper:
    """Scrapes financial news from NewsAPI, Finnhub, Alpha Vantage, and RSS feeds."""

    def __init__(self):
        self.newsapi_key = os.getenv("NEWS_API_KEY", "")
        self.finnhub_key = os.getenv("FINNHUB_API_KEY", "")
        self.alphavantage_key = os.getenv("ALPHA_VANTAGE_API_KEY", "")
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    def _ticker_keywords(self, ticker: str) -> list[str]:
        """Get keywords for filtering general feeds."""
        return TICKER_NAMES.get(ticker, [ticker])

    def _matches_ticker(self, text: str, ticker: str) -> bool:
        """Check if text mentions the ticker or its company name."""
        keywords = self._ticker_keywords(ticker)
        text_lower = text.lower()
        return any(kw.lower() in text_lower for kw in keywords)

    async def fetch_by_ticker(self, ticker: str, days_back: int = 3) -> list[dict]:
        """Fetch articles from all sources in parallel and deduplicate."""
        # Clean ticker for APIs that don't support crypto format
        clean_ticker = ticker.replace("-USD", "")

        # ── Build task list ──
        tasks: list = [
            # APIs
            self.fetch_newsapi(ticker, days_back),
            self.fetch_finnhub(clean_ticker, ticker, days_back),
            self.fetch_alphavantage(ticker, days_back),
            # Ticker-specific RSS
            self.fetch_rss(YAHOO_RSS.format(ticker=ticker), ticker),
            self.fetch_rss(GOOGLE_RSS.format(ticker=ticker), ticker),
            self.fetch_rss(SEEKING_ALPHA_RSS.format(ticker=clean_ticker), ticker),
        ]

        # General financial RSS (filter by keywords)
        for url in GENERAL_RSS:
            tasks.append(self.fetch_rss_filtered(url, ticker))

        # Crypto-specific RSS (only for crypto tickers)
        if ticker in CRYPTO_TICKERS:
            for url in CRYPTO_RSS:
                tasks.append(self.fetch_rss_filtered(url, ticker))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        articles = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Source %d failed for %s: %s", i, ticker, result)
            else:
                articles.extend(result)

        articles = self.deduplicate(articles)
        logger.info("Fetched %d unique articles for %s from %d sources",
                     len(articles), ticker, len(tasks))
        return articles

    # ═══════════════════════ API SOURCES ═══════════════════════

    async def fetch_newsapi(self, ticker: str, days_back: int) -> list[dict]:
        """Fetch articles from NewsAPI."""
        if not self.newsapi_key:
            logger.debug("NEWS_API_KEY not set, skipping NewsAPI")
            return []

        keywords = self._ticker_keywords(ticker)
        query = " OR ".join(f'"{kw}"' for kw in keywords)
        from_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")

        params = {
            "q": query,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 30,
            "from": from_date,
            "apiKey": self.newsapi_key,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(NEWSAPI_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        articles = []
        for a in data.get("articles", []):
            articles.append({
                "title": a.get("title", ""),
                "content": a.get("content") or a.get("description", ""),
                "url": a.get("url", ""),
                "source": a.get("source", {}).get("name", "NewsAPI"),
                "ticker": ticker,
                "published_at": a.get("publishedAt", ""),
            })

        logger.info("NewsAPI: %d articles for %s", len(articles), ticker)
        return articles

    async def fetch_finnhub(self, symbol: str, ticker: str, days_back: int) -> list[dict]:
        """Fetch articles from Finnhub Company News API."""
        if not self.finnhub_key:
            logger.debug("FINNHUB_API_KEY not set, skipping Finnhub")
            return []

        # Finnhub doesn't support crypto symbols well, skip them
        if ticker in CRYPTO_TICKERS:
            return []

        to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        from_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")

        params = {
            "symbol": symbol,
            "from": from_date,
            "to": to_date,
            "token": self.finnhub_key,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FINNHUB_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        articles = []
        for a in data if isinstance(data, list) else []:
            published_ts = a.get("datetime", 0)
            published_at = datetime.fromtimestamp(
                published_ts, tz=timezone.utc
            ).isoformat() if published_ts else datetime.now(timezone.utc).isoformat()

            articles.append({
                "title": a.get("headline", ""),
                "content": a.get("summary", ""),
                "url": a.get("url", ""),
                "source": a.get("source", "Finnhub"),
                "ticker": ticker,
                "published_at": published_at,
            })

        logger.info("Finnhub: %d articles for %s", len(articles), ticker)
        return articles[:30]

    async def fetch_alphavantage(self, ticker: str, days_back: int) -> list[dict]:
        """Fetch articles from Alpha Vantage News Sentiment API."""
        if not self.alphavantage_key:
            logger.debug("ALPHA_VANTAGE_API_KEY not set, skipping Alpha Vantage")
            return []

        # Alpha Vantage uses different format for crypto
        av_ticker = ticker
        if ticker == "BTC-USD":
            av_ticker = "CRYPTO:BTC"
        elif ticker == "ETH-USD":
            av_ticker = "CRYPTO:ETH"

        time_from = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y%m%dT0000")

        params = {
            "function": "NEWS_SENTIMENT",
            "tickers": av_ticker,
            "time_from": time_from,
            "limit": 30,
            "apikey": self.alphavantage_key,
        }

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(ALPHAVANTAGE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        articles = []
        for a in data.get("feed", []):
            time_pub = a.get("time_published", "")
            try:
                published_at = datetime.strptime(
                    time_pub, "%Y%m%dT%H%M%S"
                ).replace(tzinfo=timezone.utc).isoformat()
            except (ValueError, TypeError):
                published_at = datetime.now(timezone.utc).isoformat()

            articles.append({
                "title": a.get("title", ""),
                "content": a.get("summary", ""),
                "url": a.get("url", ""),
                "source": a.get("source", "Alpha Vantage"),
                "ticker": ticker,
                "published_at": published_at,
            })

        logger.info("Alpha Vantage: %d articles for %s", len(articles), ticker)
        return articles

    # ═══════════════════════ RSS SOURCES ═══════════════════════

    async def fetch_rss(self, url: str, ticker: str) -> list[dict]:
        """Fetch and parse a ticker-specific RSS feed (no filtering needed)."""
        headers = {
            "User-Agent": "Mozilla/5.0 (TradingBot/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        }
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()

        feed = feedparser.parse(resp.text)
        articles = []
        for entry in feed.entries:
            published = entry.get("published_parsed")
            if published:
                published_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            else:
                published_at = datetime.now(timezone.utc).isoformat()

            articles.append({
                "title": entry.get("title", ""),
                "content": entry.get("summary", ""),
                "url": entry.get("link", ""),
                "source": feed.feed.get("title", url.split("/")[2]),
                "ticker": ticker,
                "published_at": published_at,
            })

        logger.info("RSS %s: %d articles for %s", url.split("/")[2], len(articles), ticker)
        return articles

    async def fetch_rss_filtered(self, url: str, ticker: str) -> list[dict]:
        """Fetch a general RSS feed and filter entries matching the ticker keywords."""
        headers = {
            "User-Agent": "Mozilla/5.0 (TradingBot/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
        }
        try:
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
        except Exception as e:
            logger.warning("RSS %s failed: %s", url.split("/")[2], e)
            return []

        feed = feedparser.parse(resp.text)
        articles = []
        for entry in feed.entries:
            title = entry.get("title", "")
            summary = entry.get("summary", "")
            text = f"{title} {summary}"

            if not self._matches_ticker(text, ticker):
                continue

            published = entry.get("published_parsed")
            if published:
                published_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
            else:
                published_at = datetime.now(timezone.utc).isoformat()

            articles.append({
                "title": title,
                "content": summary,
                "url": entry.get("link", ""),
                "source": feed.feed.get("title", url.split("/")[2]),
                "ticker": ticker,
                "published_at": published_at,
            })

        logger.info("RSS filtered %s: %d articles for %s",
                     url.split("/")[2], len(articles), ticker)
        return articles

    # ═══════════════════════ STORAGE ═══════════════════════

    def deduplicate(self, articles: list[dict]) -> list[dict]:
        """Remove duplicate articles by URL and by similar titles."""
        seen_urls: set[str] = set()
        seen_titles: set[str] = set()
        unique = []
        for article in articles:
            url = article.get("url", "")
            # Normalize title for dedup
            title_norm = re.sub(r'\s+', ' ', article.get("title", "").lower().strip())

            if url and url in seen_urls:
                continue
            if title_norm and title_norm in seen_titles:
                continue

            if url:
                seen_urls.add(url)
            if title_norm:
                seen_titles.add(title_norm)
            unique.append(article)
        return unique

    async def save_to_supabase(self, articles: list[dict]) -> int:
        """Upsert articles to Supabase, skipping duplicates. Returns count of new inserts."""
        if not articles:
            return 0

        count_before = (
            self.supabase.table("articles")
            .select("id", count="exact")
            .execute()
        ).count or 0

        (
            self.supabase.table("articles")
            .upsert(articles, on_conflict="url")
            .execute()
        )

        count_after = (
            self.supabase.table("articles")
            .select("id", count="exact")
            .execute()
        ).count or 0

        new_count = count_after - count_before
        logger.info("Saved %d new articles to Supabase", new_count)
        return new_count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    TICKERS = ["AAPL", "TSLA", "NVDA", "BTC-USD", "ETH-USD", "MSFT", "XOM", "GLD"]

    async def main():
        scraper = NewsScraper()
        total = 0
        for t in TICKERS:
            print(f"\n{'='*50}")
            print(f"Scraping {t}...")
            articles = await scraper.fetch_by_ticker(t, days_back=3)
            print(f"  Trovati {len(articles)} articoli")
            saved = await scraper.save_to_supabase(articles)
            print(f"  Salvati {saved} nuovi articoli")
            total += saved
        print(f"\n{'='*50}")
        print(f"Totale nuovi articoli salvati: {total}")

    asyncio.run(main())
