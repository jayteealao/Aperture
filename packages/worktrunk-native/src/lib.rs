#![deny(clippy::all)]

mod config;
mod error;
mod worktree;

use git2::{build::RepoBuilder, FetchOptions, RemoteCallbacks};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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
    pub remote_url: Option<String>,
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
        let result = worktree::ensure_repo_ready(&params.repo_root)?;

        Ok(EnsureRepoReadyResult {
            is_git_repo: result.is_git_repo,
            default_branch: result.default_branch,
            remote_url: result.remote_url,
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

/// Clone progress information
#[napi(object)]
pub struct CloneProgress {
    pub phase: String,
    pub current: u32,
    pub total: u32,
    pub percent: u32,
}

/// Clone a repository from a URL to a target path
#[napi]
pub async fn clone_repository(
    url: String,
    target_path: String,
    #[napi(ts_arg_type = "(progress: CloneProgress) => void")]
    progress_callback: ThreadsafeFunction<CloneProgress, ErrorStrategy::Fatal>,
) -> Result<String> {
    // Wrap tsfn in Arc so it can be shared with the blocking closure
    let tsfn = Arc::new(progress_callback);

    tokio::task::spawn_blocking(move || {
        // Set up progress callbacks
        let mut callbacks = RemoteCallbacks::new();
        let tsfn_clone = Arc::clone(&tsfn);

        // Rate limiting state: only emit progress when 100ms passed OR percent changed
        let last_emit = Arc::new(Mutex::new(Instant::now()));
        let last_percent = Arc::new(Mutex::new(0u32));

        // Clone for use in callback
        let last_emit_clone = Arc::clone(&last_emit);
        let last_percent_clone = Arc::clone(&last_percent);

        callbacks.transfer_progress(move |progress| {
            let percent = if progress.total_objects() > 0 {
                ((progress.received_objects() as f64 / progress.total_objects() as f64) * 100.0)
                    as u32
            } else {
                0
            };

            // Rate limit: only emit if 100ms passed OR percent changed
            let should_emit = {
                let last = last_emit_clone.lock().unwrap();
                let last_pct = last_percent_clone.lock().unwrap();
                last.elapsed() >= Duration::from_millis(100) || percent > *last_pct
            };

            if should_emit {
                // Update tracking state
                {
                    let mut last = last_emit_clone.lock().unwrap();
                    let mut last_pct = last_percent_clone.lock().unwrap();
                    *last = Instant::now();
                    *last_pct = percent;
                }

                let phase = if progress.received_objects() < progress.total_objects() {
                    "receiving"
                } else if progress.indexed_deltas() < progress.total_deltas() {
                    "resolving"
                } else {
                    "done"
                };

                let _ = tsfn_clone.call(
                    CloneProgress {
                        phase: phase.to_string(),
                        current: progress.received_objects() as u32,
                        total: progress.total_objects() as u32,
                        percent,
                    },
                    ThreadsafeFunctionCallMode::NonBlocking,
                );
            }

            true // Continue operation
        });

        // Configure fetch options
        let mut fetch_opts = FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        // Build and execute clone
        let mut builder = RepoBuilder::new();
        builder.fetch_options(fetch_opts);

        let repo = builder
            .clone(&url, Path::new(&target_path))
            .map_err(|e| Error::new(Status::GenericFailure, format!("Clone failed: {}", e)))?;

        // Return the actual path (normalized)
        let workdir = repo
            .workdir()
            .ok_or_else(|| Error::new(Status::GenericFailure, "No workdir"))?;

        Ok(workdir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| {
        napi::Error::new(
            napi::Status::GenericFailure,
            format!("Task join error: {}", e),
        )
    })?
}
