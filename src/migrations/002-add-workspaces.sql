-- Migration 002: Add workspace support
-- Adds tables for managing workspaces and workspace agents

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT -- JSON for extensibility
);

CREATE TABLE IF NOT EXISTS workspace_agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE NOT NULL, -- Maps to sessions.id (nullable)
  branch TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, branch)
);

CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace ON workspace_agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_agents_session ON workspace_agents(session_id);

-- Update schema version
INSERT INTO schema_version (version, description) VALUES (2, 'Add workspace support');
