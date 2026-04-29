import { GitBranch } from 'lucide-react'

interface GitBranchLabelProps {
  branch: string | null
}

export function GitBranchLabel({ branch }: GitBranchLabelProps) {
  if (!branch) {
    return (
      <GitBranch
        size={12}
        className="shrink-0 text-muted-foreground/40"
        aria-hidden="true"
      />
    )
  }

  const isSha = /^[0-9a-f]{7,}$/.test(branch)
  const label = isSha
    ? `Detached HEAD (${branch})`
    : `Branch: ${branch}`

  return (
    <span
      className="flex min-w-0 items-center gap-1"
      aria-label={label}
    >
      <GitBranch size={12} className="shrink-0 text-muted-foreground" />
      <span className="font-mono text-2xs text-muted-foreground text-ellipsis overflow-hidden whitespace-nowrap">
        {branch}
      </span>
    </span>
  )
}
