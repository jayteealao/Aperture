-- Add unique constraint on repo_root (case-insensitive on Windows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_repo_root ON workspaces(repo_root);
