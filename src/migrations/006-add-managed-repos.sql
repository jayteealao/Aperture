-- Migration 006: Add managed repos support
-- Tracks repositories created/managed by the backend for session creation

CREATE TABLE IF NOT EXISTS managed_repos (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  origin_url TEXT,
  created_at INTEGER NOT NULL,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_managed_repos_workspace ON managed_repos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_managed_repos_session ON managed_repos(session_id);

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (6, strftime('%s', 'now') * 1000);
