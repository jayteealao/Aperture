import type { TurnDiffFileSummary } from '@/api/types'

export interface TurnDiffTreeFileNode {
  type: 'file'
  name: string
  path: string
  additions: number
  deletions: number
}

export interface TurnDiffTreeDirectoryNode {
  type: 'directory'
  name: string
  path: string
  additions: number
  deletions: number
  children: Array<TurnDiffTreeDirectoryNode | TurnDiffTreeFileNode>
}

function createDirectory(name: string, path: string): TurnDiffTreeDirectoryNode {
  return {
    type: 'directory',
    name,
    path,
    additions: 0,
    deletions: 0,
    children: [],
  }
}

export function buildTurnDiffTree(
  files: TurnDiffFileSummary[]
): Array<TurnDiffTreeDirectoryNode | TurnDiffTreeFileNode> {
  const root = createDirectory('', '')

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    let current = root
    let currentPath = ''

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      const isFile = index === segments.length - 1

      if (isFile) {
        current.children.push({
          type: 'file',
          name: segment,
          path: currentPath,
          additions: file.additions,
          deletions: file.deletions,
        })
        break
      }

      let directory = current.children.find(
        (child): child is TurnDiffTreeDirectoryNode =>
          child.type === 'directory' && child.name === segment
      )
      if (!directory) {
        directory = createDirectory(segment, currentPath)
        current.children.push(directory)
      }
      current = directory
    }
  }

  const summarize = (node: TurnDiffTreeDirectoryNode): void => {
    node.children.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1
      }
      return left.name.localeCompare(right.name)
    })

    let additions = 0
    let deletions = 0
    for (const child of node.children) {
      if (child.type === 'directory') {
        summarize(child)
      }
      additions += child.additions
      deletions += child.deletions
    }
    node.additions = additions
    node.deletions = deletions
  }

  summarize(root)
  return root.children
}
