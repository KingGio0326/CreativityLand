-- Initial schema for trading bot

CREATE TABLE IF NOT EXISTS articles (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    published_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sentiments (
    id BIGSERIAL PRIMARY KEY,
    article_id BIGINT REFERENCES articles(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    score REAL NOT NULL,
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signals (
    id BIGSERIAL PRIMARY KEY,
    sentiment_id BIGINT REFERENCES sentiments(id) ON DELETE CASCADE,
    signal TEXT NOT NULL CHECK (signal IN ('BUY', 'SELL', 'HOLD')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_sentiments_article ON sentiments(article_id);
CREATE INDEX idx_signals_created ON signals(created_at DESC);
