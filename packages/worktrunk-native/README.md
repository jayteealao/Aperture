# @aperture/worktrunk-native

Native Node.js addon for git worktree management using git2-rs.

## Features

- **Fast**: Built with Rust and git2-rs (libgit2 bindings)
- **Type-safe**: Full TypeScript type definitions
- **Async**: All operations are non-blocking
- **Cross-platform**: Works on Linux, macOS, and Windows

## Installation

```bash
pnpm install
pnpm build
```

## API

### ensureRepoReady

Check if a directory is a git repository and get basic info.

```typescript
import { ensureRepoReady } from '@aperture/worktrunk-native';

const result = await ensureRepoReady({ repoRoot: '/path/to/repo' });
// { isGitRepo: true, defaultBranch: 'main' }
```

### ensureWorktree

Create or get a worktree for a branch. This operation is idempotent.

```typescript
import { ensureWorktree } from '@aperture/worktrunk-native';

const result = await ensureWorktree({
  repoRoot: '/path/to/repo',
  branch: 'agent/alice',
  worktreeBaseDir: '/path/to/repo/.worktrees',
  pathTemplate: '{worktreeBaseDir}/{branch}', // optional
});
// { branch: 'agent/alice', worktreePath: '/path/to/repo/.worktrees/agent/alice' }
```

### listWorktrees

List all worktrees in a repository.

```typescript
import { listWorktrees } from '@aperture/worktrunk-native';

const worktrees = await listWorktrees({ repoRoot: '/path/to/repo' });
// [
//   { branch: 'main', path: '/path/to/repo', isMain: true, isLocked: false },
//   { branch: 'agent/alice', path: '/path/to/repo/.worktrees/agent/alice', isMain: false, isLocked: false }
// ]
```

### removeWorktree

Remove a worktree by branch name.

```typescript
import { removeWorktree } from '@aperture/worktrunk-native';

await removeWorktree({ repoRoot: '/path/to/repo', branch: 'agent/alice' });
```

## Error Handling

All functions throw errors with descriptive messages:

```typescript
try {
  await ensureRepoReady({ repoRoot: '/not/a/repo' });
} catch (error) {
  console.error(error.message); // "[NOT_A_GIT_REPO] Not a git repository: /not/a/repo"
}
```

## Development

### Build

```bash
pnpm build         # Release build
pnpm build:debug   # Debug build
```

### Test

```bash
pnpm test
```

## License

MIT
