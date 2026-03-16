def scraper_agent(state):
    from scraper.news_scraper import NewsScraper
    import asyncio
    scraper = NewsScraper()
    articles = asyncio.run(
        scraper.fetch_by_ticker(state["ticker"], days_back=2)
    )
    state["articles"] = articles
    state["reasoning"].append(
        f"ScraperAgent: trovati {len(articles)} articoli "
        f"per {state['ticker']}"
    )
    return state
