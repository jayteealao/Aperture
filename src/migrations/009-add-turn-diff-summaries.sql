CREATE TABLE IF NOT EXISTS turn_diff_summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message_id TEXT,
  assistant_message_id TEXT NOT NULL,
  checkpoint_id TEXT,
  provider_session_id TEXT,
  working_directory TEXT NOT NULL,
  turn_started_at INTEGER NOT NULL,
  turn_completed_at INTEGER NOT NULL,
  git_base_head TEXT,
  git_head_at_completion TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  additions INTEGER NOT NULL DEFAULT 0,
  deletions INTEGER NOT NULL DEFAULT 0,
  files_json TEXT NOT NULL,
  patch_text TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_turn_diff_summaries_session_id
  ON turn_diff_summaries(session_id);

CREATE INDEX IF NOT EXISTS idx_turn_diff_summaries_assistant_message_id
  ON turn_diff_summaries(assistant_message_id);

CREATE INDEX IF NOT EXISTS idx_turn_diff_summaries_user_message_id
  ON turn_diff_summaries(user_message_id);
