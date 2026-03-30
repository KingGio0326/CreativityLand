-- Migration 007: Add Purged K-Fold CV metadata to ml_validation
ALTER TABLE ml_validation ADD COLUMN IF NOT EXISTS cv_method text DEFAULT 'purged_kfold';
ALTER TABLE ml_validation ADD COLUMN IF NOT EXISTS embargo_pct float8;
ALTER TABLE ml_validation ADD COLUMN IF NOT EXISTS n_purged integer;
