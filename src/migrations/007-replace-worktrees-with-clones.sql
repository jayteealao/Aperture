-- Migration 007: Replace worktrees with local clones
-- Drop workspace_agents (replaced by managed_repos with clone_source)
DROP TABLE IF EXISTS workspace_agents;

-- Add clone_source to managed_repos to track how each repo was created
ALTER TABLE managed_repos ADD COLUMN clone_source TEXT NOT NULL DEFAULT 'external';

-- Add updated_at to managed_repos for consistency
ALTER TABLE managed_repos ADD COLUMN updated_at INTEGER;

-- Backfill updated_at from created_at
UPDATE managed_repos SET updated_at = created_at WHERE updated_at IS NULL;

-- Update schema version
INSERT INTO schema_version (version, applied_at) VALUES (7, strftime('%s', 'now'));
