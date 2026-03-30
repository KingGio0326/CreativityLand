-- Migration 008: Meta-Labeling model storage
CREATE TABLE IF NOT EXISTS ml_models (
    id serial PRIMARY KEY,
    model_name text NOT NULL UNIQUE,
    model_data jsonb NOT NULL,
    feature_names text[] NOT NULL,
    metrics jsonb,
    trained_at timestamptz DEFAULT now(),
    n_samples integer
);
