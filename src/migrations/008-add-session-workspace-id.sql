-- Add server-owned workspace association for sessions
ALTER TABLE sessions ADD COLUMN workspace_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions(workspace_id);

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (8, strftime('%s', 'now') * 1000);
