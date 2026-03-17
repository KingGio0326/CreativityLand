CREATE TABLE IF NOT EXISTS price_patterns (
  id              BIGSERIAL PRIMARY KEY,
  ticker          TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  pattern_vector  vector(30),
  outcome_5d      FLOAT,
  outcome_10d     FLOAT,
  outcome_20d     FLOAT,
  context_news    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON price_patterns
  USING ivfflat (pattern_vector vector_cosine_ops)
  WITH (lists = 50);
