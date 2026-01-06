use thiserror::Error;

/// Error codes for worktree operations
#[derive(Debug, Error)]
pub enum WorktreeError {
    #[error("Not a git repository: {0}")]
    NotAGitRepo(String),

    #[error("Failed to create worktree: {0}")]
    WorktreeCreateFailed(String),

    #[error("Worktree not found: {0}")]
    WorktreeNotFound(String),

    #[error("Failed to remove worktree: {0}")]
    WorktreeRemoveFailed(String),

    #[error("Worktree is currently in use: {0}")]
    WorktreeInUse(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Git error: {0}")]
    GitError(String),

    #[error("I/O error: {0}")]
    IoError(String),
}

impl From<git2::Error> for WorktreeError {
    fn from(err: git2::Error) -> Self {
        WorktreeError::GitError(err.message().to_string())
    }
}

impl From<std::io::Error> for WorktreeError {
    fn from(err: std::io::Error) -> Self {
        WorktreeError::IoError(err.to_string())
    }
}

/// Convert our error type to napi Error
impl From<WorktreeError> for napi::Error {
    fn from(err: WorktreeError) -> Self {
        let code = match &err {
            WorktreeError::NotAGitRepo(_) => "NOT_A_GIT_REPO",
            WorktreeError::WorktreeCreateFailed(_) => "WORKTREE_CREATE_FAILED",
            WorktreeError::WorktreeNotFound(_) => "WORKTREE_NOT_FOUND",
            WorktreeError::WorktreeRemoveFailed(_) => "WORKTREE_REMOVE_FAILED",
            WorktreeError::WorktreeInUse(_) => "WORKTREE_IN_USE",
            WorktreeError::InvalidPath(_) => "INVALID_PATH",
            WorktreeError::GitError(_) => "GIT_ERROR",
            WorktreeError::IoError(_) => "IO_ERROR",
        };

        napi::Error::new(
            napi::Status::GenericFailure,
            format!("[{}] {}", code, err),
        )
    }
}
