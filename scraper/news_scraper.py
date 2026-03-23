"""Professional news scraper with trafilatura full-text extraction,
Finnhub, Alpha Vantage, NewsAPI, and curated RSS feeds."""

import asyncio
import logging
import os
from datetime import datetime, timedelta

import feedparser
import finnhub
import httpx
import trafilatura
from dotenv import load_dotenv
from supabase import create_client

# ── Configuration ──────────────────────────────────────────────

CRYPTO_TICKERS = ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD"]

# ── Geopolitical classification ───────────────────────────────

GEOPOLITICAL_KEYWORDS: dict[str, list[str]] = {
    "high": [
        "war", "guerra", "invasion", "invasione", "missile strike",
        "nuclear", "nucleare", "sanctions package", "oil embargo",
        "embargo petrolifero", "military escalation", "escalation militare",
        "coup", "colpo di stato", "blockade", "blocco navale",
        "martial law", "legge marziale",
        "attack", "attacco", "drone strike", "airstrike",
        "cyberattack", "cybersecurity breach", "regime change",
    ],
    "medium": [
        "sanctions", "sanzioni", "tariff", "dazi", "trade war",
        "guerra commerciale", "NATO", "OPEC", "ceasefire", "cessate il fuoco",
        "diplomatic crisis", "crisi diplomatica", "arms deal",
        "military deployment", "dispiegamento militare",
        "export ban", "divieto di esportazione",
        "supply chain disruption", "chip ban", "semiconductor ban",
        "energy crisis", "crisi energetica", "debt ceiling",
    ],
    "low": [
        "geopolitical", "geopolitico", "tension", "tensione",
        "diplomat", "diplomazia", "summit", "vertice",
        "bilateral", "bilaterale", "treaty", "trattato",
        "UN resolution", "risoluzione ONU", "peacekeeping",
        "election", "elezioni", "referendum", "protest", "protesta",
    ],
}


def classify_geopolitical_relevance(
    title: str, content: str,
) -> tuple[str, float]:
    """Classify an article's geopolitical relevance.

    Returns (level, weight_multiplier):
      - "high"   → 2.0x
      - "medium" → 1.5x
      - "low"    → 1.2x
      - "none"   → 1.0x
    """
    combined = f"{title} {content}".lower()
    for level, keywords in GEOPOLITICAL_KEYWORDS.items():
        if any(kw.lower() in combined for kw in keywords):
            weight = {"high": 2.0, "medium": 1.5, "low": 1.2}[level]
            return level, weight
    return "none", 1.0

RSS_SOURCES_STOCKS = {
    "google_news": "https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en",
    "cnbc": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
    "benzinga": "https://www.benzinga.com/stock/{ticker_lower}/feed",
    # Seeking Alpha and MarketWatch removed: return 403/401 consistently
    "motley_fool": "https://www.fool.com/feeds/index.aspx?id=headlines&ticker={ticker}",
    "investopedia": "https://www.investopedia.com/feedbuilder/feed/getfeed?feedName=rss_headline",
    "thestreet": "https://www.thestreet.com/.rss/full/",
    "zacks": "https://www.zacks.com/stock/news/{ticker}?icid=quote-stock_overview-zacks_news-quote_news_feed-rss",
    "reuters": "https://news.google.com/rss/search?q={ticker}+site:reuters.com&hl=en-US&gl=US&ceid=US:en",
    "ap_news": "https://news.google.com/rss/search?q={ticker}+site:apnews.com&hl=en-US&gl=US&ceid=US:en",
}

RSS_SOURCES_CRYPTO = {
    "coindesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "cointelegraph": "https://cointelegraph.com/rss",
    "the_block": "https://www.theblock.co/rss.xml",
    "google_news": "https://news.google.com/rss/search?q={ticker_clean}+crypto&hl=en-US&gl=US&ceid=US:en",
    "decrypt": "https://decrypt.co/feed",
    "beincrypto": "https://beincrypto.com/feed/",
}

# ── Monitored tickers ────────────────────────────────────────
MONITORED_TICKERS = [
    "AAPL", "TSLA", "NVDA", "MSFT", "XOM", "GLD", "BTC-USD", "ETH-USD",
]

# ── Ticker detection for general-purpose feeds ────────────────
TICKER_KEYWORDS: dict[str, list[str]] = {
    "AAPL": ["apple", "aapl", "iphone", "ipad", "tim cook", "cupertino"],
    "TSLA": ["tesla", "tsla", "elon musk", "cybertruck", "model 3", "model y"],
    "NVDA": ["nvidia", "nvda", "geforce", "rtx", "jensen huang", "cuda"],
    "MSFT": ["microsoft", "msft", "azure", "windows", "satya nadella", "copilot"],
    "XOM": ["exxon", "xom", "exxonmobil", "oil major"],
    "GLD": ["gold", "gld", "precious metal", "gold etf", "oro"],
    "BTC-USD": ["bitcoin", "btc", "crypto", "satoshi"],
    "ETH-USD": ["ethereum", "eth", "ether", "vitalik"],
}


def detect_ticker(title: str, content: str) -> str | None:
    """Detect which monitored ticker an article is about.

    Returns the first matching ticker or None.
    """
    combined = f"{title} {content}".lower()
    for ticker, keywords in TICKER_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            return ticker
    return None


# ── Helpers ────────────────────────────────────────────────────

def is_crypto(ticker: str) -> bool:
    return ticker in CRYPTO_TICKERS


def clean_ticker_crypto(ticker: str) -> str:
    mapping = {
        "BTC-USD": "Bitcoin",
        "ETH-USD": "Ethereum",
        "SOL-USD": "Solana",
        "BNB-USD": "BNB",
    }
    return mapping.get(ticker, ticker.replace("-USD", ""))


def convert_ticker_finnhub(ticker: str) -> str:
    crypto_map = {
        "BTC-USD": "BINANCE:BTCUSDT",
        "ETH-USD": "BINANCE:ETHUSDT",
        "SOL-USD": "BINANCE:SOLUSDT",
    }
    return crypto_map.get(ticker, ticker)


def clean_html_text(text: str) -> str:
    """Clean residual HTML tags and entities from extracted text."""
    import re
    if not text:
        return ""
    if "<" in text and ">" in text:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "html.parser")
        text = soup.get_text(separator=" ")
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_clean_text(url: str, html: str) -> str:
    """Extract clean article text using trafilatura with BS4 fallback."""
    # Priority 1: trafilatura
    try:
        text = trafilatura.extract(
            html, url=url,
            include_comments=False, include_tables=False,
            favor_precision=True, deduplicate=True,
        )
        if text and len(text) > 100:
            return clean_html_text(text)
    except Exception:
        pass

    # Priority 2: BeautifulSoup fallback
    try:
        import re
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        text = soup.get_text(separator=" ")
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 100:
            return clean_html_text(text[:3000])
    except Exception:
        pass

    return ""


async def extract_content_safe(url: str, rss_summary: str = "") -> str:
    """Try full-text extraction with graceful fallback to RSS summary.

    Priority: trafilatura full-text > RSS summary > empty string.
    """
    if not url:
        return clean_html_text(rss_summary) if rss_summary else ""
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=12,
            headers={"User-Agent": "Mozilla/5.0"},
        ) as client:
            page = await client.get(url)
        full = extract_clean_text(url, page.text)
        if full and len(full) > 100:
            return full
    except Exception:
        pass
    # Fallback to RSS summary
    if rss_summary:
        return clean_html_text(rss_summary)
    return ""


def normalize_date(date_str) -> str:
    try:
        from dateutil import parser as dateparser
        return dateparser.parse(str(date_str)).isoformat()
    except Exception:
        return datetime.now().isoformat()


# ── Scraper ────────────────────────────────────────────────────

class NewsScraper:

    def __init__(self):
        self.logger = logging.getLogger("scraper")
        load_dotenv()
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )
        finnhub_key = os.getenv("FINNHUB_API_KEY")
        self.finnhub = finnhub.Client(api_key=finnhub_key) if finnhub_key else None

    # ── URL resolution ──

    async def resolve_redirect(self, url: str) -> str:
        """Resolve redirects, with special handling for Google News URLs."""
        if "news.google.com" in url:
            try:
                from googlenewsdecoder import GoogleDecoder
                decoder = GoogleDecoder()
                result = decoder.decode_google_news_url(url)
                if result and result.get("status"):
                    decoded = result.get("decoded_url", url)
                    self.logger.debug(
                        "Google decoded: %s", decoded[:80],
                    )
                    return decoded
            except Exception as e:
                self.logger.debug("GoogleDecoder failed: %s", e)
            # Fallback: try GET with follow_redirects
            try:
                async with httpx.AsyncClient(
                    follow_redirects=True, timeout=10,
                    headers={
                        "User-Agent": (
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/120.0.0.0 Safari/537.36"
                        ),
                    },
                ) as client:
                    r = await client.get(url)
                    final_url = str(r.url)
                    if "news.google.com" not in final_url:
                        return final_url
            except Exception:
                pass
            return url

        # For all other URLs: follow redirects normally
        try:
            async with httpx.AsyncClient(
                follow_redirects=True, timeout=10,
                headers={"User-Agent": "Mozilla/5.0"},
            ) as client:
                r = await client.head(url)
                return str(r.url)
        except Exception:
            return url

    # ── SOURCE 1: RSS with trafilatura full-text ──

    async def fetch_rss_with_fulltext(
        self, url: str, ticker: str,
        source_name: str, use_fulltext: bool = True,
    ) -> list[dict]:
        try:
            async with httpx.AsyncClient(
                follow_redirects=True, timeout=15,
                headers={"User-Agent": "Mozilla/5.0"},
            ) as client:
                resp = await client.get(url)

            feed = feedparser.parse(resp.text)
            articles = []

            for entry in feed.entries[:15]:
                title = entry.get("title", "")
                if not title:
                    continue

                # Filter crypto feeds by keyword
                if is_crypto(ticker):
                    keyword = clean_ticker_crypto(ticker).lower()
                    combined = f"{title} {entry.get('summary', '')}".lower()
                    if keyword not in combined:
                        continue

                rss_summary = entry.get("summary", "")

                # For Google News, force fulltext and ignore RSS summary
                if source_name == "Google News":
                    use_fulltext = True
                    rss_summary = ""

                # Full text extraction with graceful fallback
                if use_fulltext and entry.get("link"):
                    try:
                        real_url = await self.resolve_redirect(entry.link)
                        content = await extract_content_safe(real_url, rss_summary)
                        await asyncio.sleep(0.3)
                    except Exception as e:
                        self.logger.debug("Full text fallback for %s: %s", entry.link, e)
                        content = clean_html_text(rss_summary)
                else:
                    content = clean_html_text(rss_summary)

                articles.append({
                    "title": title,
                    "content": content,
                    "url": entry.get("link", ""),
                    "source": source_name,
                    "ticker": ticker,
                    "published_at": normalize_date(
                        entry.get("published", datetime.now().isoformat())
                    ),
                })

            self.logger.info("%s: %d articles for %s", source_name, len(articles), ticker)
            return articles
        except Exception as e:
            self.logger.warning("%s failed for %s: %s", source_name, ticker, e)
            return []

    # ── SOURCE 2: Google News with redirect resolution ──

    async def fetch_google_news(self, ticker: str, days_back: int) -> list[dict]:
        query = clean_ticker_crypto(ticker) if is_crypto(ticker) else f"{ticker} stock"
        url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
        return await self.fetch_rss_with_fulltext(url, ticker, "Google News", use_fulltext=True)

    # ── SOURCE 3: NewsAPI with full-text ──

    async def fetch_newsapi(self, ticker: str, days_back: int) -> list[dict]:
        api_key = os.getenv("NEWS_API_KEY")
        if not api_key:
            return []
        try:
            from_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
            query = clean_ticker_crypto(ticker) if is_crypto(ticker) else ticker
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q": query,
                        "language": "en",
                        "sortBy": "publishedAt",
                        "pageSize": 20,
                        "from": from_date,
                        "apiKey": api_key,
                    },
                )
            data = resp.json()
            articles = []
            for item in data.get("articles", []):
                if item.get("title") == "[Removed]":
                    continue
                content = item.get("content") or item.get("description") or ""
                # Try trafilatura on original URL
                if item.get("url"):
                    try:
                        async with httpx.AsyncClient(
                            follow_redirects=True, timeout=12,
                            headers={"User-Agent": "Mozilla/5.0"},
                        ) as client:
                            page = await client.get(item["url"])
                        full = extract_clean_text(item["url"], page.text)
                        if full:
                            content = full
                        await asyncio.sleep(0.3)
                    except Exception:
                        pass
                articles.append({
                    "title": item.get("title", ""),
                    "content": content,
                    "url": item.get("url", ""),
                    "source": item.get("source", {}).get("name", "NewsAPI"),
                    "ticker": ticker,
                    "published_at": normalize_date(item.get("publishedAt", "")),
                })
            self.logger.info("NewsAPI: %d articles for %s", len(articles), ticker)
            return articles
        except Exception as e:
            self.logger.warning("NewsAPI failed: %s", e)
            return []

    # ── SOURCE 4: Finnhub (clean text already) ──

    def fetch_finnhub(self, ticker: str, days_back: int) -> list[dict]:
        if not self.finnhub:
            return []
        if is_crypto(ticker):
            self.logger.debug("Finnhub: skip crypto %s", ticker)
            return []
        try:
            finnhub_ticker = convert_ticker_finnhub(ticker)
            from_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
            to_date = datetime.now().strftime("%Y-%m-%d")
            news = self.finnhub.company_news(
                finnhub_ticker, _from=from_date, to=to_date,
            )
            articles = []
            for n in (news or [])[:20]:
                if not n.get("headline"):
                    continue
                articles.append({
                    "title": n["headline"],
                    "content": n.get("summary", ""),
                    "url": n.get("url", ""),
                    "source": n.get("source", "Finnhub"),
                    "ticker": ticker,
                    "published_at": datetime.fromtimestamp(
                        n.get("datetime", 0)
                    ).isoformat(),
                })
            self.logger.info("Finnhub: %d articles for %s", len(articles), ticker)
            return articles
        except Exception as e:
            self.logger.warning("Finnhub failed for %s: %s", ticker, e)
            return []

    # ── SOURCE 5: Alpha Vantage ──

    async def fetch_alpha_vantage(self, ticker: str) -> list[dict]:
        api_key = os.getenv("ALPHA_VANTAGE_KEY")
        if not api_key:
            return []
        try:
            av_ticker = ticker.replace("-USD", "")
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://www.alphavantage.co/query",
                    params={
                        "function": "NEWS_SENTIMENT",
                        "tickers": av_ticker,
                        "limit": 20,
                        "apikey": api_key,
                    },
                )
            data = resp.json()
            articles = []
            for item in data.get("feed", []):
                articles.append({
                    "title": item.get("title", ""),
                    "content": item.get("summary", ""),
                    "url": item.get("url", ""),
                    "source": item.get("source", "Alpha Vantage"),
                    "ticker": ticker,
                    "published_at": normalize_date(
                        item.get("time_published", "")
                    ),
                })
            self.logger.info("Alpha Vantage: %d articles for %s", len(articles), ticker)
            return articles
        except Exception as e:
            self.logger.warning("Alpha Vantage failed: %s", e)
            return []

    # ── MAIN FETCH ──

    async def fetch_by_ticker(self, ticker: str, days_back: int = 2) -> list[dict]:
        ticker_lower = ticker.lower().replace("-usd", "")

        # Common tasks
        tasks = [
            self.fetch_google_news(ticker, days_back),
            self.fetch_newsapi(ticker, days_back),
            self.fetch_alpha_vantage(ticker),
        ]

        # Finnhub is sync — run in thread
        loop = asyncio.get_event_loop()
        finnhub_task = loop.run_in_executor(
            None, self.fetch_finnhub, ticker, days_back,
        )

        if is_crypto(ticker):
            tasks += [
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_CRYPTO["coindesk"],
                    ticker, "CoinDesk", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_CRYPTO["cointelegraph"],
                    ticker, "CoinTelegraph", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_CRYPTO["the_block"],
                    ticker, "The Block", use_fulltext=False,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_CRYPTO["decrypt"],
                    ticker, "Decrypt", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_CRYPTO["beincrypto"],
                    ticker, "BeInCrypto", use_fulltext=True,
                ),
            ]
        else:
            tasks += [
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["cnbc"],
                    ticker, "CNBC", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["benzinga"].format(ticker_lower=ticker_lower),
                    ticker, "Benzinga", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["motley_fool"].format(ticker=ticker),
                    ticker, "Motley Fool", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["investopedia"],
                    ticker, "Investopedia", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["thestreet"],
                    ticker, "TheStreet", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["reuters"].format(ticker=ticker),
                    ticker, "Reuters", use_fulltext=True,
                ),
                self.fetch_rss_with_fulltext(
                    RSS_SOURCES_STOCKS["ap_news"].format(ticker=ticker),
                    ticker, "AP News", use_fulltext=True,
                ),
            ]

        results = await asyncio.gather(*tasks, finnhub_task, return_exceptions=True)

        all_articles = []
        for r in results:
            if isinstance(r, list):
                all_articles.extend(r)
            elif isinstance(r, Exception):
                self.logger.warning("Source error: %s", r)

        # Filter: only keep articles relevant to monitored tickers
        filtered = []
        for a in all_articles:
            # Articles already tagged with this ticker pass through
            if a.get("ticker") == ticker:
                filtered.append(a)
                continue
            # For general feeds, detect ticker from content
            detected = detect_ticker(a.get("title", ""), a.get("content", ""))
            if detected == ticker:
                a["ticker"] = ticker
                filtered.append(a)

        # Deduplicate by URL
        seen: set[str] = set()
        unique = []
        for a in filtered:
            url = a.get("url", "")
            if url and url not in seen and len(a.get("title", "")) > 10:
                seen.add(url)
                unique.append(a)

        self.logger.info(
            "%s: %d unique articles (from %d total, %d filtered, %d dupes removed)",
            ticker, len(unique), len(all_articles), len(filtered),
            len(filtered) - len(unique),
        )
        return unique

    # ── SAVE TO SUPABASE ──

    async def save_to_supabase(self, articles: list[dict]) -> int:
        if not articles:
            return 0
        try:
            existing = self.supabase.table("articles").select("url").execute()
            existing_urls = {r["url"] for r in existing.data}

            new_articles = [
                a for a in articles
                if a.get("url") and a["url"] not in existing_urls
            ]
            if not new_articles:
                return 0

            # Classify geopolitical relevance
            for a in new_articles:
                geo_level, geo_weight = classify_geopolitical_relevance(
                    a.get("title", ""), a.get("content", ""),
                )
                a["geo_relevance"] = geo_level
                a["geo_weight"] = geo_weight

            self.supabase.table("articles").upsert(
                new_articles, on_conflict="url",
            ).execute()

            self.logger.info("Saved %d new articles", len(new_articles))
            return len(new_articles)
        except Exception as e:
            self.logger.error("Supabase save error: %s", e)
            return 0

    # ── RUN ALL TICKERS ──

    async def run_all(
        self, tickers: list[str] | None = None, days_back: int = 2,
    ) -> dict:
        if tickers is None:
            tickers = [
                "AAPL", "TSLA", "NVDA", "MSFT",
                "XOM", "GLD", "BTC-USD", "ETH-USD",
            ]
        results = {}
        for ticker in tickers:
            articles = await self.fetch_by_ticker(ticker, days_back)
            saved = await self.save_to_supabase(articles)
            results[ticker] = {"found": len(articles), "saved": saved}
            self.logger.info("%s: found=%d, saved=%d", ticker, len(articles), saved)
            await asyncio.sleep(1)
        return results


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    async def main():
        scraper = NewsScraper()
        tickers_input = os.getenv(
            "INPUT_TICKERS",
            "AAPL,TSLA,NVDA,BTC-USD,ETH-USD,MSFT,XOM,GLD",
        )
        tickers = [t.strip() for t in tickers_input.split(",")]

        print(f"Scraping {len(tickers)} ticker...")
        results = await scraper.run_all(tickers=tickers, days_back=2)

        # Summary logging
        total_found = sum(r["found"] for r in results.values())
        total_saved = sum(r["saved"] for r in results.values())
        print("\n=== SCRAPING SUMMARY ===")
        for ticker, r in results.items():
            status = "OK" if r["found"] > 0 else "EMPTY"
            print(f"  {ticker}: found={r['found']}, saved={r['saved']} [{status}]")
        print(f"  TOTALE: {total_found} trovati, {total_saved} salvati")
        print(f"  Ticker analizzati: {len(tickers)}")
        empty = [t for t, r in results.items() if r["found"] == 0]
        if empty:
            print(f"  ATTENZIONE: nessun articolo per: {', '.join(empty)}")
        print("========================\n")

    asyncio.run(main())
