-- ══════════════════════════════════════════════════════════
-- FASE 2: Tabelle per auto-trading (positions, trades, vista)
-- ══════════════════════════════════════════════════════════

-- Posizioni aperte/chiuse
CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  entry_price float NOT NULL,
  shares float NOT NULL,
  allocated_usd float,
  stop_loss float,
  take_profit float,
  signal_id uuid REFERENCES signals(id),
  opened_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- Storico trade completati
CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  entry_price float NOT NULL,
  exit_price float,
  shares float NOT NULL,
  pnl_usd float,
  pnl_pct float,
  signal_id_open uuid REFERENCES signals(id),
  signal_id_close uuid REFERENCES signals(id),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  close_reason text CHECK (close_reason IN ('signal', 'stop_loss', 'take_profit', 'manual', 'circuit_breaker'))
);

-- Indici
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_ticker ON positions(ticker);
CREATE INDEX idx_trades_ticker ON trades(ticker);
CREATE INDEX idx_trades_closed ON trades(closed_at DESC);

-- Vista riepilogo portafoglio
CREATE OR REPLACE VIEW portfolio_summary AS
SELECT
  -- Capitale investito (somma allocazioni posizioni aperte)
  COALESCE(SUM(CASE WHEN p.status = 'open' THEN p.allocated_usd ELSE 0 END), 0) AS capitale_investito,
  -- Conteggio posizioni aperte
  COUNT(CASE WHEN p.status = 'open' THEN 1 END) AS posizioni_aperte,
  -- P&L totale da trade chiusi
  COALESCE((SELECT SUM(t.pnl_usd) FROM trades t), 0) AS pnl_totale,
  -- P&L ultimo giorno
  COALESCE(
    (SELECT SUM(t.pnl_usd) FROM trades t WHERE t.closed_at >= now() - interval '24 hours'),
    0
  ) AS pnl_giornaliero,
  -- Conteggio trade totali
  (SELECT COUNT(*) FROM trades) AS trade_totali,
  -- Win rate
  CASE
    WHEN (SELECT COUNT(*) FROM trades WHERE pnl_usd IS NOT NULL) > 0
    THEN ROUND(
      (SELECT COUNT(*) FROM trades WHERE pnl_usd > 0)::numeric /
      (SELECT COUNT(*) FROM trades WHERE pnl_usd IS NOT NULL)::numeric * 100, 1
    )
    ELSE 0
  END AS win_rate
FROM positions p;
