import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger("arxiv_search")

ARXIV_API = "https://export.arxiv.org/api/query"

TRADING_QUERIES = {
    "sentiment": "stock market sentiment analysis LLM prediction",
    "technical": "technical analysis machine learning trading signals",
    "regime": "market regime detection hidden markov model",
    "momentum": "momentum trading factor investing returns",
    "mean_reversion": "mean reversion pairs trading statistical arbitrage",
    "macro": "macroeconomic indicators stock market prediction",
    "ml_prediction": "XGBoost gradient boosting financial forecasting",
    "pattern": "price pattern matching time series finance",
    "options": "options market implied volatility prediction",
    "liquidity": "market liquidity monetary policy asset prices",
}


def search_arxiv(
    query: str,
    max_results: int = 5,
    days_back: int = 365,
) -> list[dict]:
    """
    Cerca paper su arXiv e ritorna lista di:
    {title, abstract, authors, published, url}
    """
    date_from = datetime.now() - timedelta(days=days_back)
    date_str = date_from.strftime("%Y%m%d")

    params = {
        "search_query": f"all:{query} AND submittedDate:[{date_str} TO 99991231]",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }

    try:
        resp = httpx.get(ARXIV_API, params=params, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("arXiv API error: %s", e)
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(resp.text)
    entries = root.findall("atom:entry", ns)

    papers = []
    for entry in entries:
        title = entry.findtext("atom:title", "", ns).strip().replace("\n", " ")
        abstract = entry.findtext("atom:summary", "", ns).strip().replace("\n", " ")
        published = entry.findtext("atom:published", "", ns)[:10]
        url = entry.findtext("atom:id", "", ns)

        authors = [
            a.findtext("atom:name", "", ns)
            for a in entry.findall("atom:author", ns)
        ][:3]

        papers.append({
            "title": title,
            "abstract": abstract[:500],
            "authors": authors,
            "published": published,
            "url": url,
        })

    logger.info("arXiv: trovati %d paper per '%s'", len(papers), query[:50])
    return papers


def search_for_context(
    ticker: str,
    signal: str,
    regime: str,
    agents_context: dict,
) -> list[dict]:
    """
    Seleziona le query piu rilevanti in base al contesto
    e cerca i paper corrispondenti.
    """
    relevant_queries = []

    # Sempre includi sentiment e ML
    relevant_queries.append(TRADING_QUERIES["sentiment"])
    relevant_queries.append(TRADING_QUERIES["ml_prediction"])

    # Aggiungi in base al regime
    if regime in ["bear", "volatile_bull"]:
        relevant_queries.append(TRADING_QUERIES["macro"])
    if regime == "bull":
        relevant_queries.append(TRADING_QUERIES["momentum"])

    # Aggiungi in base agli agenti dominanti
    if agents_context.get("mean_reversion_active"):
        relevant_queries.append(TRADING_QUERIES["mean_reversion"])
    if agents_context.get("technical_bearish"):
        relevant_queries.append(TRADING_QUERIES["technical"])

    # Deduplica e limita a 3 query
    unique_queries = list(dict.fromkeys(relevant_queries))[:3]

    all_papers = []
    for q in unique_queries:
        papers = search_arxiv(q, max_results=3)
        all_papers.extend(papers)

    # Rimuovi duplicati per URL
    seen: set[str] = set()
    unique_papers = []
    for p in all_papers:
        if p["url"] not in seen:
            seen.add(p["url"])
            unique_papers.append(p)

    return unique_papers[:6]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    papers = search_arxiv(
        "stock market prediction transformer neural network",
        max_results=3,
    )
    for p in papers:
        print(f"\n{p['published']} — {p['title'][:80]}")
        print(f"  {p['abstract'][:200]}...")
        print(f"  URL: {p['url']}")
