import { CodeHighlight } from '@/components/ui/CodeHighlight'
import { getLanguageFromPath } from '@/utils/language'
import { File, Search, Globe, Terminal, PenLine, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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
    <div className="min-w-0 max-w-full">
      {description && (
        <div className="mb-2 flex min-w-0 max-w-full items-center gap-2 text-xs text-foreground/40">
          <Terminal size={12} />
          <span className="min-w-0 break-words">{description}</span>
        </div>
      )}
      <div className="rounded-lg overflow-hidden">
        <CodeHighlight
          className="rounded-lg"
          language="bash"
          code={command || ''}
        />
      </div>
    </div>
  )
}

function FileDisplay({ path }: { path: string }) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <File size={14} className="text-foreground/40 shrink-0" />
      <code className="min-w-0 max-w-full truncate text-2xs font-mono text-muted-foreground">
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
    <div className="min-w-0 max-w-full space-y-2">
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <File size={14} className="text-foreground/40 shrink-0" />
        <code className="min-w-0 max-w-full truncate text-2xs font-mono text-muted-foreground">
          {filePath}
        </code>
      </div>
      {preview && (
        <div className="rounded-lg overflow-hidden">
          <CodeHighlight
            className="rounded-lg max-h-[120px]"
            code={preview}
            language={getLanguageFromPath(filePath)}
            style={{ maxHeight: '120px' }}
          />
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
    <div className="min-w-0 max-w-full space-y-2">
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <PenLine size={14} className="text-foreground/40 shrink-0" />
        <code className="min-w-0 max-w-full truncate text-2xs font-mono text-muted-foreground">
          {filePath}
        </code>
      </div>
      {(oldString || newString) && (
        <div className="rounded-lg overflow-hidden border border-border">
          {oldString && (
            <div className="bg-danger/10 border-b border-border">
              <div className="px-2 py-1 text-2xs font-medium text-danger border-b border-border">
                − Remove
              </div>
              <pre className="max-w-full overflow-x-auto p-2 text-2xs text-muted-foreground">
                {truncate(oldString, 150)}
              </pre>
            </div>
          )}
          {newString && (
            <div className="bg-success/10">
              <div className="px-2 py-1 text-2xs font-medium text-success border-b border-border">
                + Add
              </div>
              <pre className="max-w-full overflow-x-auto p-2 text-2xs text-muted-foreground">
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
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <Search size={14} className="text-foreground/40 shrink-0" />
      <div className="min-w-0 max-w-full overflow-hidden text-2xs">
        <code className="font-mono text-accent">{pattern}</code>
        {path && (
          <span className="break-all text-foreground/40"> in {path}</span>
        )}
      </div>
    </div>
  )
}

function WebFetchDisplay({ input }: { input: Record<string, unknown> }) {
  const url = input.url as string

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <Globe size={14} className="text-foreground/40 shrink-0" />
      <code className="min-w-0 max-w-full truncate text-2xs font-mono text-accent">
        {url}
      </code>
    </div>
  )
}

function WebSearchDisplay({ input }: { input: Record<string, unknown> }) {
  const query = input.query as string

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <Search size={14} className="text-foreground/40 shrink-0" />
      <span className="min-w-0 break-words text-2xs text-muted-foreground">
        Searching: <span className="text-accent font-medium">{query}</span>
      </span>
    </div>
  )
}

function TaskDisplay({ input }: { input: Record<string, unknown> }) {
  const subagentType = input.subagent_type as string | undefined
  const description = input.description as string | undefined

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <Bot size={14} className="text-foreground/40 shrink-0" />
      {subagentType && (
        <Badge variant="default" size="sm" className="text-2xs">
          {subagentType}
        </Badge>
      )}
      {description && (
        <span className="min-w-0 break-words text-2xs text-muted-foreground">
          {description}
        </span>
      )}
    </div>
  )
}

function DefaultDisplay({ input }: { input: Record<string, unknown> }) {
  return (
    <div className="rounded-lg overflow-hidden">
      <CodeHighlight
        className="rounded-lg max-h-[150px]"
        code={JSON.stringify(input, null, 2)}
        language="json"
        style={{ maxHeight: '150px' }}
      />
    </div>
  )
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}
