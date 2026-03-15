-- Abilita pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabella articoli scrappati
CREATE TABLE articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  url text UNIQUE NOT NULL,
  source text,
  ticker text NOT NULL,
  published_at timestamptz,
  scraped_at timestamptz DEFAULT now(),
  embedding vector(384),
  sentiment_label text CHECK (sentiment_label IN ('positive','negative','neutral')),
  sentiment_score float,
  processed boolean DEFAULT false
);

-- Tabella segnali generati
CREATE TABLE signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  signal text NOT NULL CHECK (signal IN ('BUY','SELL','HOLD')),
  confidence float NOT NULL,
  reasoning text,
  articles_used uuid[],
  created_at timestamptz DEFAULT now()
);

-- Tabella risultati backtesting
CREATE TABLE backtest_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  total_return float,
  sharpe_ratio float,
  max_drawdown float,
  win_rate float,
  trades_count int,
  created_at timestamptz DEFAULT now()
);

-- Indici per performance
CREATE INDEX idx_articles_ticker ON articles(ticker);
CREATE INDEX idx_articles_processed ON articles(processed);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_signals_ticker ON signals(ticker);
CREATE INDEX idx_signals_created ON signals(created_at DESC);

-- Indice vettoriale per semantic search
CREATE INDEX ON articles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Funzione per semantic search via RPC
CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(384),
  filter_ticker text DEFAULT NULL,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  url text,
  source text,
  ticker text,
  published_at timestamptz,
  sentiment_label text,
  sentiment_score float,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    a.id, a.title, a.content, a.url, a.source, a.ticker,
    a.published_at, a.sentiment_label, a.sentiment_score,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM articles a
  WHERE a.embedding IS NOT NULL
    AND (filter_ticker IS NULL OR a.ticker = filter_ticker)
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;
