-- Cache for FFD optimal d values (Fractional Differentiation, AFML cap. 5)
-- Computed during Sunday retraining, read during 6h runs

CREATE TABLE IF NOT EXISTS ml_feature_params (
    id serial PRIMARY KEY,
    ticker text NOT NULL,
    feature_name text NOT NULL,
    optimal_d float8,
    adf_pvalue float8,
    computed_at timestamptz DEFAULT now(),
    UNIQUE(ticker, feature_name)
);

COMMENT ON TABLE ml_feature_params IS 'Cached optimal fractional differentiation order per ticker/feature';
