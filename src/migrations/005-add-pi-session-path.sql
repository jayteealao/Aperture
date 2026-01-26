-- Add Pi SDK session path for session resumption
-- This stores the path to the Pi session file which enables resumption

ALTER TABLE sessions ADD COLUMN pi_session_path TEXT;

-- Index for efficient Pi session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_pi_session_path ON sessions(pi_session_path);

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (5, strftime('%s', 'now') * 1000);
