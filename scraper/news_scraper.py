"""News scraper module for fetching financial news from various sources."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import feedparser
import httpx
from dotenv import load_dotenv
import os
from supabase import create_client

load_dotenv()

logger = logging.getLogger("scraper")

NEWSAPI_URL = "https://newsapi.org/v2/everything"
YAHOO_RSS = "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}"
GOOGLE_RSS = "https://news.google.com/rss/search?q={ticker}+stock&hl=en"


class NewsScraper:
    """Scrapes financial news from NewsAPI, Yahoo Finance RSS and Google News RSS."""

    def __init__(self):
        self.newsapi_key = os.getenv("NEWS_API_KEY", "")
        self.supabase = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_KEY", ""),
        )

    async def fetch_by_ticker(self, ticker: str, days_back: int = 3) -> list[dict]:
        """Fetch articles from all sources in parallel and deduplicate."""
        yahoo_url = YAHOO_RSS.format(ticker=ticker)
        google_url = GOOGLE_RSS.format(ticker=ticker)

        results = await asyncio.gather(
            self.fetch_newsapi(ticker, days_back),
            self.fetch_rss(yahoo_url, ticker),
            self.fetch_rss(google_url, ticker),
            return_exceptions=True,
        )

        articles = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Source %d failed: %s", i, result)
            else:
                articles.extend(result)

        articles = self.deduplicate(articles)
        logger.info("Fetched %d unique articles for %s", len(articles), ticker)
        return articles

    async def fetch_newsapi(self, ticker: str, days_back: int) -> list[dict]:
        """Fetch articles from NewsAPI."""
        if not self.newsapi_key:
            logger.warning("NEWS_API_KEY not set, skipping NewsAPI")
            return []

        from_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        params = {
            "q": ticker,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 20,
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
                "source": a.get("source", {}).get("name", "newsapi"),
                "ticker": ticker,
                "published_at": a.get("publishedAt", ""),
            })

        logger.info("NewsAPI returned %d articles for %s", len(articles), ticker)
        return articles

    async def fetch_rss(self, url: str, ticker: str) -> list[dict]:
        """Fetch and parse an RSS feed."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
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
                "source": feed.feed.get("title", url),
                "ticker": ticker,
                "published_at": published_at,
            })

        logger.info("RSS %s returned %d articles", url[:60], len(articles))
        return articles

    def deduplicate(self, articles: list[dict]) -> list[dict]:
        """Remove duplicate articles by URL."""
        seen: set[str] = set()
        unique = []
        for article in articles:
            url = article.get("url", "")
            if url and url not in seen:
                seen.add(url)
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

    async def main():
        scraper = NewsScraper()
        articles = await scraper.fetch_by_ticker("AAPL", days_back=1)
        print(f"Trovati {len(articles)} articoli")
        saved = await scraper.save_to_supabase(articles)
        print(f"Salvati {saved} nuovi articoli")

    asyncio.run(main())
