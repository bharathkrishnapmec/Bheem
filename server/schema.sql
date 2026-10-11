CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY, board TEXT NOT NULL, device_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0,
  build TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL, period_key TEXT NOT NULL,
  device_id TEXT NOT NULL, name TEXT NOT NULL,
  value INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0, time_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (board, period_key, device_id)
);
CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (board, period_key, value);
CREATE INDEX IF NOT EXISTS idx_scores_rank_tie ON scores (board, period_key, value, hits, time_ms);
CREATE INDEX IF NOT EXISTS idx_runs_expiry ON runs (expires_at);
