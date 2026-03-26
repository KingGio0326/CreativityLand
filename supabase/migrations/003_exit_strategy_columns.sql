-- ══════════════════════════════════════════════════════════
-- ExitStrategyAgent: add SL/TP columns to signals table
-- ══════════════════════════════════════════════════════════

ALTER TABLE signals ADD COLUMN IF NOT EXISTS stop_loss FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS take_profit FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS sl_percentage FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS tp_percentage FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS risk_reward_ratio FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS atr_14 FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trailing_activation FLOAT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS trailing_level FLOAT;
