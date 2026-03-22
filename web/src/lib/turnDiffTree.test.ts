import { describe, expect, it } from 'vitest'
import { buildTurnDiffTree } from './turnDiffTree'

describe('buildTurnDiffTree', () => {
  it('groups changed files into nested directories with rolled up stats', () => {
    const tree = buildTurnDiffTree([
      { path: 'src/app.ts', additions: 4, deletions: 1 },
      { path: 'src/lib/util.ts', additions: 2, deletions: 0 },
      { path: 'README.md', additions: 1, deletions: 1 },
    ])

    expect(tree).toHaveLength(2)
    const srcDir = tree.find((node) => node.type === 'directory' && node.name === 'src')
    expect(srcDir).toBeDefined()
    expect(srcDir?.additions).toBe(6)
    expect(srcDir?.deletions).toBe(1)
    expect(tree.find((node) => node.type === 'file' && node.name === 'README.md')).toBeDefined()
  })
})
