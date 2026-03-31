-- Migration 009: Ratcheting Take Profit columns on positions table
-- Run in Supabase SQL Editor

ALTER TABLE positions
    ADD COLUMN IF NOT EXISTS ratchet_count   integer   DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_ratchet_at timestamptz,
    ADD COLUMN IF NOT EXISTS ratchet_history jsonb     DEFAULT '[]'::jsonb;
