import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from scraper.news_scraper import NewsScraper


def test_deduplicate_removes_duplicates():
    scraper = NewsScraper()
    articles = [
        {"url": "https://example.com/1", "title": "A"},
        {"url": "https://example.com/1", "title": "A dup"},
        {"url": "https://example.com/2", "title": "B"},
    ]
    result = scraper.deduplicate(articles)
    assert len(result) == 2


def test_deduplicate_empty():
    scraper = NewsScraper()
    assert scraper.deduplicate([]) == []


@pytest.mark.asyncio
async def test_fetch_rss_returns_list():
    scraper = NewsScraper()
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_response = MagicMock()
        mock_response.text = ""
        mock_response.raise_for_status = MagicMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_ctx.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_ctx
        with patch("feedparser.parse") as mock_parse:
            mock_parse.return_value = MagicMock(entries=[])
            result = await scraper.fetch_rss(
                "https://fake.rss/feed", "AAPL"
            )
            assert isinstance(result, list)
