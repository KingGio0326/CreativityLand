-- Triple Barrier Labeling columns (López de Prado, AFML cap. 3)
-- Added to signal_evaluations for barrier-based signal quality assessment

ALTER TABLE signal_evaluations ADD COLUMN IF NOT EXISTS barrier_label integer;
ALTER TABLE signal_evaluations ADD COLUMN IF NOT EXISTS barrier_hit text;
ALTER TABLE signal_evaluations ADD COLUMN IF NOT EXISTS barrier_hit_hours float8;
ALTER TABLE signal_evaluations ADD COLUMN IF NOT EXISTS max_favorable_pct float8;
ALTER TABLE signal_evaluations ADD COLUMN IF NOT EXISTS max_adverse_pct float8;

COMMENT ON COLUMN signal_evaluations.barrier_label IS '1=TP hit (BUY correct), -1=SL hit (SELL correct), 0=neutral';
COMMENT ON COLUMN signal_evaluations.barrier_hit IS 'Which barrier was hit first: upper, lower, vertical';
COMMENT ON COLUMN signal_evaluations.barrier_hit_hours IS 'Hours from entry to barrier hit';
COMMENT ON COLUMN signal_evaluations.max_favorable_pct IS 'Max favorable excursion (MFE) in %';
COMMENT ON COLUMN signal_evaluations.max_adverse_pct IS 'Max adverse excursion (MAE) in %';
