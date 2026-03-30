-- Portfolio peak equity tracking for max drawdown protection
CREATE TABLE IF NOT EXISTS portfolio_peak (
    id SERIAL PRIMARY KEY,
    peak_equity NUMERIC(12, 2) NOT NULL DEFAULT 100000.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with Alpaca paper account default
INSERT INTO portfolio_peak (peak_equity) VALUES (100000.00)
ON CONFLICT DO NOTHING;

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_portfolio_peak_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_portfolio_peak_updated
    BEFORE UPDATE ON portfolio_peak
    FOR EACH ROW
    EXECUTE FUNCTION update_portfolio_peak_timestamp();
