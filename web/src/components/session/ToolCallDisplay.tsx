import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { File, Search, Globe, Terminal, Edit3 } from 'lucide-react'

interface ToolCallDisplayProps {
  name?: string
  rawInput: Record<string, unknown>
}

export function ToolCallDisplay({ name, rawInput }: ToolCallDisplayProps) {
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
    default:
      return <DefaultDisplay input={rawInput} />
  }
}

function BashDisplay({ input }: { input: Record<string, unknown> }) {
  const command = input.command as string
  const description = input.description as string | undefined

  return (
    <div className="mt-2">
      {description && (
        <div className="flex items-center gap-2 mb-1 text-xs text-[var(--color-text-muted)]">
          <Terminal size={12} />
          <span>{description}</span>
        </div>
      )}
      <div className="rounded-lg overflow-hidden">
        <SyntaxHighlighter
          style={oneDark}
          language="bash"
          customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem' }}
        >
          {command}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

function FileDisplay({ path }: { path: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)]">
      <File size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <code className="text-xs font-mono text-[var(--color-text-secondary)] truncate">
        {path}
      </code>
    </div>
  )
}

function WriteDisplay({ input }: { input: Record<string, unknown> }) {
  const filePath = input.file_path as string
  const content = input.content as string | undefined
  const preview = content ? (content.length > 200 ? content.slice(0, 200) + '...' : content) : undefined

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)]">
        <File size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <code className="text-xs font-mono text-[var(--color-text-secondary)] truncate">
          {filePath}
        </code>
      </div>
      {preview && (
        <div className="rounded-lg overflow-hidden">
          <SyntaxHighlighter
            style={oneDark}
            language={getLanguageFromPath(filePath)}
            customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.7rem', maxHeight: '150px' }}
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
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)]">
        <Edit3 size={14} className="text-[var(--color-text-muted)] shrink-0" />
        <code className="text-xs font-mono text-[var(--color-text-secondary)] truncate">
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
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)]">
      <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <div className="text-xs overflow-hidden">
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
    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-tertiary)]">
      <Globe size={14} className="text-[var(--color-text-muted)] shrink-0" />
      <code className="text-xs font-mono text-accent truncate">
        {url}
      </code>
    </div>
  )
}

function DefaultDisplay({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="mt-2 rounded-lg overflow-hidden">
      <SyntaxHighlighter
        style={oneDark}
        language="json"
        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.7rem', maxHeight: '200px' }}
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
