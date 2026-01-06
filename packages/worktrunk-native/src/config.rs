use std::path::{Path, PathBuf};

/// Path template for worktree creation
/// Supports simple variable substitution
pub struct PathTemplate {
    template: String,
}

impl PathTemplate {
    pub fn new(template: String) -> Self {
        Self { template }
    }

    /// Render the template with the given variables
    pub fn render(&self, repo_root: &Path, base_dir: &Path, branch: &str) -> PathBuf {
        let mut result = self.template.clone();

        // Replace template variables
        result = result.replace("{repoRoot}", repo_root.to_str().unwrap_or(""));
        result = result.replace(
            "{worktreeBaseDir}",
            base_dir.to_str().unwrap_or(""),
        );
        result = result.replace("{branch}", branch);

        PathBuf::from(result)
    }
}

impl Default for PathTemplate {
    fn default() -> Self {
        Self {
            template: "{worktreeBaseDir}/{branch}".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_template() {
        let template = PathTemplate::default();
        let result = template.render(
            Path::new("/repo"),
            Path::new("/repo/.worktrees"),
            "feat/test",
        );
        assert_eq!(result, PathBuf::from("/repo/.worktrees/feat/test"));
    }

    #[test]
    fn test_custom_template() {
        let template = PathTemplate::new("{repoRoot}/.wt/{branch}".to_string());
        let result = template.render(
            Path::new("/repo"),
            Path::new("/repo/.worktrees"),
            "main",
        );
        assert_eq!(result, PathBuf::from("/repo/.wt/main"));
    }
}
