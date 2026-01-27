import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { File, Search, Globe, Terminal, Edit3, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface ToolInputDisplayProps {
  name: string
  input: unknown
}

export function ToolInputDisplay({ name, input }: ToolInputDisplayProps) {
  const rawInput = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>

  switch (name) {
    case 'Bash':
      return <BashDisplay input={rawInput} />
    case 'Read':
      return <FileDisplay path={rawInput.file_path as string} />
    case 'Write':
      return <WriteDisplay input={rawInput} />
    case 'Edit':
      return <EditDisplay input={rawInput} />
    case 'Glob':
    case 'Grep':
      return <SearchDisplay input={rawInput} />
    case 'WebFetch':
      return <WebFetchDisplay input={rawInput} />
    case 'WebSearch':
      return <WebSearchDisplay input={rawInput} />
    case 'Task':
      return <TaskDisplay input={rawInput} />
    default:
      return <DefaultDisplay input={rawInput} />
  }
}

function BashDisplay({ input }: { input: Record<string, unknown> }) {
  const command = input.command as string
  const description = input.description as string | undefined

  return (
    <div>
      {description && (
        <div className="flex items-center gap-2 mb-2 text-xs text-[var(--color-text-muted)]">
          <Terminal size={12} />
          <span>{description}</span>
        </div>
      )}
      <div className="rounded-lg overflow-hidden">
        <SyntaxHighlighter
          style={oneDark}
          language="bash"
          customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.7rem' }}
        >
          {command || ''}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

function FileDisplay({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-2">
      <File size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate">
        {path}
      </code>
    </div>
  )
}

function WriteDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = input.file_path as string
  const content = input.content as string | undefined
  const preview = content ? truncate(content, 300) : undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <File size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate">
          {filePath}
        </code>
      </div>
      {preview && (
        <div className="rounded-lg overflow-hidden">
          <SyntaxHighlighter
            style={oneDark}
            language={getLanguageFromPath(filePath)}
            customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.65rem', maxHeight: '120px' }}
          >
            {preview}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  )
}

function EditDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = input.file_path as string
  const oldString = input.old_string as string | undefined
  const newString = input.new_string as string | undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Edit3 size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <code className="text-[10px] font-mono text-[var(--color-text-secondary)] truncate">
          {filePath}
        </code>
      </div>
      {(oldString || newString) && (
        <div className="rounded-lg overflow-hidden border border-[var(--color-border)]">
          {oldString && (
            <div className="bg-danger/10 border-b border-[var(--color-border)]">
              <div className="px-2 py-1 text-2xs font-medium text-danger border-b border-[var(--color-border)]">
                − Remove
              </div>
              <pre className="p-2 text-[10px] overflow-x-auto text-[var(--color-text-secondary)]">
                {truncate(oldString, 150)}
              </pre>
            </div>
          )}
          {newString && (
            <div className="bg-success/10">
              <div className="px-2 py-1 text-2xs font-medium text-success border-b border-[var(--color-border)]">
                + Add
              </div>
              <pre className="p-2 text-[10px] overflow-x-auto text-[var(--color-text-secondary)]">
                {truncate(newString, 150)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SearchDisplay({ input }: { input: Record<string, unknown> }) {
  const pattern = (input.pattern as string) || (input.glob as string)
  const path = input.path as string | undefined

  return (
    <div className="flex items-center gap-2">
      <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <div className="text-[10px] overflow-hidden">
        <code className="font-mono text-accent">{pattern}</code>
        {path && (
          <span className="text-[var(--color-text-muted)]"> in {path}</span>
        )}
      </div>
    </div>
  )
}

function WebFetchDisplay({ input }: { input: Record<string, unknown> }) {
  const url = input.url as string

  return (
    <div className="flex items-center gap-2">
      <Globe size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <code className="text-[10px] font-mono text-accent truncate">
        {url}
      </code>
    </div>
  )
}

function WebSearchDisplay({ input }: { input: Record<string, unknown> }) {
  const query = input.query as string

  return (
    <div className="flex items-center gap-2">
      <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <span className="text-[10px] text-[var(--color-text-secondary)]">
        Searching: <span className="text-accent font-medium">{query}</span>
      </span>
    </div>
  )
}

function TaskDisplay({ input }: { input: Record<string, unknown> }) {
  const subagentType = input.subagent_type as string | undefined
  const description = input.description as string | undefined

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Bot size={14} className="text-[var(--color-text-muted)] shrink-0" />
      {subagentType && (
        <Badge variant="default" size="sm" className="text-2xs">
          {subagentType}
        </Badge>
      )}
      {description && (
        <span className="text-[10px] text-[var(--color-text-secondary)]">{description}</span>
      )}
    </div>
  )
}

function DefaultDisplay({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="rounded-lg overflow-hidden">
      <SyntaxHighlighter
        style={oneDark}
        language="json"
        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.65rem', maxHeight: '150px' }}
      >
        {JSON.stringify(input, null, 2)}
      </SyntaxHighlighter>
    </div>
  )
}

function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    json: 'json',
    py: 'python',
    rs: 'rust',
    go: 'go',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
  }
  return langMap[ext || ''] || 'text'
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
