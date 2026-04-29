import { GitBranch } from 'lucide-react'

interface GitBranchLabelProps {
  branch: string | null | undefined
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

  return (
    <span
      className="flex min-w-0 items-center gap-1"
      aria-label={`Git branch: ${branch}`}
    >
      <GitBranch size={12} className="shrink-0 text-muted-foreground" />
      <span className="font-mono text-2xs text-muted-foreground text-ellipsis overflow-hidden whitespace-nowrap">
        {branch}
      </span>
    </span>
  )
}
