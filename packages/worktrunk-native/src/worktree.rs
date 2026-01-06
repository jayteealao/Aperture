use crate::config::PathTemplate;
use crate::error::WorktreeError;
use git2::{BranchType, Repository};
use std::fs;
use std::path::{Path, PathBuf};

/// Information about a worktree
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    pub branch: String,
    pub path: PathBuf,
    pub is_main: bool,
    pub is_locked: bool,
}

/// Check if a directory is a git repository
pub fn ensure_repo_ready(repo_root: &str) -> Result<(bool, Option<String>), WorktreeError> {
    let repo_path = Path::new(repo_root);

    if !repo_path.exists() {
        return Err(WorktreeError::InvalidPath(format!(
            "Path does not exist: {}",
            repo_root
        )));
    }

    let repo = Repository::open(repo_path).map_err(|_| {
        WorktreeError::NotAGitRepo(format!("Not a git repository: {}", repo_root))
    })?;

    // Try to get the default branch
    let default_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()));

    Ok((true, default_branch))
}

/// Sanitize a branch name to be used as a worktree name (for .git/worktrees/)
/// Replace slashes with dashes to avoid directory structure issues
fn sanitize_worktree_name(branch: &str) -> String {
    branch.replace('/', "-")
}

/// Ensure a worktree exists for the given branch
/// This is idempotent - if the worktree already exists, it returns the existing path
pub fn ensure_worktree(
    repo_root: &str,
    branch: &str,
    worktree_base_dir: &str,
    path_template: Option<&str>,
) -> Result<(String, PathBuf), WorktreeError> {
    let repo_path = Path::new(repo_root);
    let repo = Repository::open(repo_path).map_err(|_| {
        WorktreeError::NotAGitRepo(format!("Not a git repository: {}", repo_root))
    })?;

    // Check if worktree already exists for this branch
    if let Some(existing_path) = find_worktree_for_branch(&repo, branch)? {
        return Ok((branch.to_string(), existing_path));
    }

    // Compute worktree path using template
    let template = match path_template {
        Some(t) => PathTemplate::new(t.to_string()),
        None => PathTemplate::default(),
    };

    let worktree_path = template.render(
        repo_path,
        Path::new(worktree_base_dir),
        branch,
    );

    // Ensure parent directory exists
    if let Some(parent) = worktree_path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Check if branch exists
    let branch_exists = repo
        .find_branch(branch, BranchType::Local)
        .is_ok();

    // Sanitize the worktree name for use in .git/worktrees/
    let worktree_name = sanitize_worktree_name(branch);

    if branch_exists {
        // Branch exists - create worktree from it
        repo.worktree(
            &worktree_name,
            &worktree_path,
            None,
        )
        .map_err(|e| {
            WorktreeError::WorktreeCreateFailed(format!(
                "Failed to create worktree for existing branch '{}': {}",
                branch, e
            ))
        })?;
    } else {
        // Branch doesn't exist - create new branch + worktree
        // First, get the HEAD commit
        let head = repo.head().map_err(|e| {
            WorktreeError::GitError(format!("Failed to get HEAD: {}", e))
        })?;

        let head_commit = head.peel_to_commit().map_err(|e| {
            WorktreeError::GitError(format!("Failed to get HEAD commit: {}", e))
        })?;

        // Create the worktree with a new branch
        let mut opts = git2::WorktreeAddOptions::new();

        // Create a reference for the new branch
        let branch_ref_name = format!("refs/heads/{}", branch);
        let branch_ref = repo.reference(
            &branch_ref_name,
            head_commit.id(),
            false,
            &format!("create branch {} for worktree", branch),
        ).map_err(|e| {
            WorktreeError::WorktreeCreateFailed(format!(
                "Failed to create branch '{}': {}",
                branch, e
            ))
        })?;

        opts.reference(Some(&branch_ref));

        repo.worktree(&worktree_name, &worktree_path, Some(&opts))
            .map_err(|e| {
                WorktreeError::WorktreeCreateFailed(format!(
                    "Failed to create worktree with new branch '{}': {}",
                    branch, e
                ))
            })?;
    }

    Ok((branch.to_string(), worktree_path))
}

/// Find worktree path for a given branch
fn find_worktree_for_branch(
    repo: &Repository,
    branch: &str,
) -> Result<Option<PathBuf>, WorktreeError> {
    let worktrees = repo.worktrees().map_err(|e| {
        WorktreeError::GitError(format!("Failed to list worktrees: {}", e))
    })?;

    for worktree_name in worktrees.iter().flatten() {
        if let Ok(worktree) = repo.find_worktree(worktree_name) {
            // Open the worktree repository to check its branch
            if let Ok(wt_repo) = Repository::open_from_worktree(&worktree) {
                if let Ok(head) = wt_repo.head() {
                    if let Some(head_name) = head.shorthand() {
                        if head_name == branch {
                            return Ok(Some(worktree.path().to_path_buf()));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

/// List all worktrees
pub fn list_worktrees(repo_root: &str) -> Result<Vec<WorktreeInfo>, WorktreeError> {
    let repo_path = Path::new(repo_root);
    let repo = Repository::open(repo_path).map_err(|_| {
        WorktreeError::NotAGitRepo(format!("Not a git repository: {}", repo_root))
    })?;

    let mut result = Vec::new();

    // Add main worktree
    if let Ok(head) = repo.head() {
        if let Some(branch_name) = head.shorthand() {
            let mut path = repo.workdir()
                .unwrap_or_else(|| Path::new(repo_root))
                .to_path_buf();

            // Remove trailing slash if present (workdir() returns path with trailing /)
            if path.to_string_lossy().ends_with('/') {
                path = PathBuf::from(path.to_string_lossy().trim_end_matches('/'));
            }

            result.push(WorktreeInfo {
                branch: branch_name.to_string(),
                path,
                is_main: true,
                is_locked: false,
            });
        }
    }

    // Add linked worktrees
    let worktrees = repo.worktrees().map_err(|e| {
        WorktreeError::GitError(format!("Failed to list worktrees: {}", e))
    })?;

    for worktree_name in worktrees.iter().flatten() {
        if let Ok(worktree) = repo.find_worktree(worktree_name) {
            let is_locked = worktree.is_locked().is_ok();
            let path = worktree.path().to_path_buf();

            // Get branch name from worktree
            let branch = if let Ok(wt_repo) = Repository::open_from_worktree(&worktree) {
                wt_repo
                    .head()
                    .ok()
                    .and_then(|head| head.shorthand().map(|s| s.to_string()))
                    .unwrap_or_else(|| worktree_name.to_string())
            } else {
                worktree_name.to_string()
            };

            result.push(WorktreeInfo {
                branch,
                path,
                is_main: false,
                is_locked,
            });
        }
    }

    Ok(result)
}

/// Remove a worktree by branch name
pub fn remove_worktree(repo_root: &str, branch: &str) -> Result<(), WorktreeError> {
    let repo_path = Path::new(repo_root);
    let repo = Repository::open(repo_path).map_err(|_| {
        WorktreeError::NotAGitRepo(format!("Not a git repository: {}", repo_root))
    })?;

    // Find the worktree for this branch
    let worktrees = repo.worktrees().map_err(|e| {
        WorktreeError::GitError(format!("Failed to list worktrees: {}", e))
    })?;

    for worktree_name in worktrees.iter().flatten() {
        if let Ok(worktree) = repo.find_worktree(worktree_name) {
            // Check if this worktree is for the target branch
            let is_target = if let Ok(wt_repo) = Repository::open_from_worktree(&worktree) {
                wt_repo
                    .head()
                    .ok()
                    .and_then(|head| head.shorthand().map(|s| s == branch))
                    .unwrap_or(false)
            } else {
                false
            };

            if is_target {
                // Found the worktree - prune it with valid flag to allow pruning valid worktrees
                let mut opts = git2::WorktreePruneOptions::new();
                opts.valid(true); // Allow pruning valid (non-corrupt) worktrees

                worktree.prune(Some(&mut opts)).map_err(|e| {
                    WorktreeError::WorktreeRemoveFailed(format!(
                        "Failed to remove worktree for branch '{}': {}",
                        branch, e
                    ))
                })?;

                // Delete the branch
                if let Ok(mut local_branch) = repo.find_branch(branch, BranchType::Local) {
                    let _ = local_branch.delete();
                }

                return Ok(());
            }
        }
    }

    Err(WorktreeError::WorktreeNotFound(format!(
        "No worktree found for branch '{}'",
        branch
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn init_test_repo() -> (TempDir, PathBuf) {
        let temp = TempDir::new().unwrap();
        let repo_path = temp.path().join("repo");
        fs::create_dir(&repo_path).unwrap();

        let repo = Repository::init(&repo_path).unwrap();

        // Configure user
        let mut config = repo.config().unwrap();
        config.set_str("user.name", "Test User").unwrap();
        config.set_str("user.email", "test@example.com").unwrap();

        // Create initial commit
        let sig = repo.signature().unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();
            index.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "Initial commit",
            &tree,
            &[],
        )
        .unwrap();

        (temp, repo_path)
    }

    #[test]
    fn test_ensure_repo_ready() {
        let (_temp, repo_path) = init_test_repo();
        let (is_repo, branch) = ensure_repo_ready(repo_path.to_str().unwrap()).unwrap();
        assert!(is_repo);
        assert!(branch.is_some());
    }

    #[test]
    fn test_ensure_repo_ready_not_a_repo() {
        let temp = TempDir::new().unwrap();
        let not_a_repo = temp.path().join("not-a-repo");
        fs::create_dir(&not_a_repo).unwrap();

        let result = ensure_repo_ready(not_a_repo.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn test_ensure_worktree_creates_new() {
        let (_temp, repo_path) = init_test_repo();
        let base_dir = repo_path.join(".worktrees");

        let (branch, path) = ensure_worktree(
            repo_path.to_str().unwrap(),
            "test-branch",
            base_dir.to_str().unwrap(),
            None,
        )
        .unwrap();

        assert_eq!(branch, "test-branch");
        assert!(path.exists());
    }

    #[test]
    fn test_ensure_worktree_idempotent() {
        let (_temp, repo_path) = init_test_repo();
        let base_dir = repo_path.join(".worktrees");

        let (_, path1) = ensure_worktree(
            repo_path.to_str().unwrap(),
            "test-branch",
            base_dir.to_str().unwrap(),
            None,
        )
        .unwrap();

        let (_, path2) = ensure_worktree(
            repo_path.to_str().unwrap(),
            "test-branch",
            base_dir.to_str().unwrap(),
            None,
        )
        .unwrap();

        assert_eq!(path1, path2);
    }

    #[test]
    fn test_list_worktrees() {
        let (_temp, repo_path) = init_test_repo();
        let base_dir = repo_path.join(".worktrees");

        // Create a worktree
        ensure_worktree(
            repo_path.to_str().unwrap(),
            "test-branch",
            base_dir.to_str().unwrap(),
            None,
        )
        .unwrap();

        let worktrees = list_worktrees(repo_path.to_str().unwrap()).unwrap();
        assert!(worktrees.len() >= 2); // Main + test-branch
    }

    #[test]
    fn test_remove_worktree() {
        let (_temp, repo_path) = init_test_repo();
        let base_dir = repo_path.join(".worktrees");

        // Create a worktree
        ensure_worktree(
            repo_path.to_str().unwrap(),
            "test-branch",
            base_dir.to_str().unwrap(),
            None,
        )
        .unwrap();

        // Remove it
        remove_worktree(repo_path.to_str().unwrap(), "test-branch").unwrap();

        // Verify it's gone
        let worktrees = list_worktrees(repo_path.to_str().unwrap()).unwrap();
        assert!(!worktrees.iter().any(|w| w.branch == "test-branch"));
    }
}
