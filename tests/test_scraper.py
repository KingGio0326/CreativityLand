"""Tests for the news scraper module."""

from scraper.news_scraper import NewsScraper


def test_scraper_init():
    scraper = NewsScraper()
    assert scraper.sources == []


def test_scraper_with_sources():
    sources = ["https://example.com/rss"]
    scraper = NewsScraper(sources=sources)
    assert scraper.sources == sources
