-- Add unique constraint on repo_root (case-insensitive on Windows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_repo_root ON workspaces(repo_root);

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (3, strftime('%s', 'now') * 1000);
