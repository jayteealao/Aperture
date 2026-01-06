#![deny(clippy::all)]

mod config;
mod error;
mod worktree;

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Parameters for ensureRepoReady
#[napi(object)]
pub struct EnsureRepoReadyParams {
    pub repo_root: String,
}

/// Result from ensureRepoReady
#[napi(object)]
pub struct EnsureRepoReadyResult {
    pub is_git_repo: bool,
    pub default_branch: Option<String>,
}

/// Parameters for ensureWorktree
#[napi(object)]
pub struct EnsureWorktreeParams {
    pub repo_root: String,
    pub branch: String,
    pub worktree_base_dir: String,
    pub path_template: Option<String>,
}

/// Result from ensureWorktree
#[napi(object)]
pub struct EnsureWorktreeResult {
    pub branch: String,
    pub worktree_path: String,
}

/// Worktree information
#[napi(object)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: String,
    pub is_main: bool,
    pub is_locked: bool,
}

/// Parameters for listWorktrees
#[napi(object)]
pub struct ListWorktreesParams {
    pub repo_root: String,
}

/// Parameters for removeWorktree
#[napi(object)]
pub struct RemoveWorktreeParams {
    pub repo_root: String,
    pub branch: String,
}

/// Ensure a repository is ready and return basic info
#[napi]
pub async fn ensure_repo_ready(
    params: EnsureRepoReadyParams,
) -> Result<EnsureRepoReadyResult> {
    tokio::task::spawn_blocking(move || {
        let (is_git_repo, default_branch) =
            worktree::ensure_repo_ready(&params.repo_root)?;

        Ok(EnsureRepoReadyResult {
            is_git_repo,
            default_branch,
        })
    })
    .await
    .map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Task join error: {}", e),
        )
    })?
}

/// Ensure a worktree exists for the given branch (idempotent)
#[napi]
pub async fn ensure_worktree(
    params: EnsureWorktreeParams,
) -> Result<EnsureWorktreeResult> {
    tokio::task::spawn_blocking(move || {
        let (branch, worktree_path) = worktree::ensure_worktree(
            &params.repo_root,
            &params.branch,
            &params.worktree_base_dir,
            params.path_template.as_deref(),
        )?;

        Ok(EnsureWorktreeResult {
            branch,
            worktree_path: worktree_path.to_string_lossy().to_string(),
        })
    })
    .await
    .map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Task join error: {}", e),
        )
    })?
}

/// List all worktrees in a repository
#[napi]
pub async fn list_worktrees(params: ListWorktreesParams) -> Result<Vec<WorktreeInfo>> {
    tokio::task::spawn_blocking(move || {
        let worktrees = worktree::list_worktrees(&params.repo_root)?;

        Ok(worktrees
            .into_iter()
            .map(|w| WorktreeInfo {
                branch: w.branch,
                path: w.path.to_string_lossy().to_string(),
                is_main: w.is_main,
                is_locked: w.is_locked,
            })
            .collect())
    })
    .await
    .map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Task join error: {}", e),
        )
    })?
}

/// Remove a worktree by branch name
#[napi]
pub async fn remove_worktree(params: RemoveWorktreeParams) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        worktree::remove_worktree(&params.repo_root, &params.branch)?;
        Ok(())
    })
    .await
    .map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Task join error: {}", e),
        )
    })?
}
