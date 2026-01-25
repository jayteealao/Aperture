-- Add SDK session ID column (distinct from ACP session ID)
-- SDK sessions can be resumed using this ID via the Claude Agent SDK
ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT;

-- Add session configuration for SDK sessions (JSON blob)
ALTER TABLE sessions ADD COLUMN sdk_config TEXT;

-- Track which sessions can be resumed (0 = not resumable, 1 = resumable)
ALTER TABLE sessions ADD COLUMN is_resumable INTEGER DEFAULT 0;

-- Working directory needed for SDK resumption
ALTER TABLE sessions ADD COLUMN working_directory TEXT;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sessions_sdk_session_id ON sessions(sdk_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_resumable ON sessions(is_resumable) WHERE is_resumable = 1;

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (4, strftime('%s', 'now') * 1000);
