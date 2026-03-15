"""News scraper module for fetching financial news from various sources."""

import feedparser
import requests
from bs4 import BeautifulSoup


class NewsScraper:
    """Scrapes financial news from RSS feeds and web sources."""

    def __init__(self, sources: list[str] | None = None):
        self.sources = sources or []

    def fetch_rss(self, url: str) -> list[dict]:
        """Fetch and parse an RSS feed."""
        feed = feedparser.parse(url)
        return [
            {
                "title": entry.get("title", ""),
                "summary": entry.get("summary", ""),
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
            }
            for entry in feed.entries
        ]

    def fetch_page(self, url: str) -> str:
        """Fetch and extract text content from a web page."""
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        return soup.get_text(separator=" ", strip=True)

    def fetch_all(self) -> list[dict]:
        """Fetch news from all configured sources."""
        articles = []
        for source in self.sources:
            articles.extend(self.fetch_rss(source))
        return articles
