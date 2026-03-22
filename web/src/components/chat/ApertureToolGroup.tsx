import { useMemo } from 'react'
import { getToolName } from 'ai'
import { ChevronDownIcon, WrenchIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { getStatusBadge } from '@/components/ai-elements/tool'
import { ApertureToolPart, type ToolPartUnion } from './ApertureToolPart'

const RUNNING_STATES = new Set(['input-available', 'input-streaming'])
const DONE_STATES = new Set(['approval-responded', 'output-available', 'output-denied', 'output-error'])

function getToolFamily(part: ToolPartUnion): string {
  return getToolName(part)
}

function getGroupState(parts: ToolPartUnion[]): ToolPartUnion['state'] {
  if (parts.some((part) => part.state === 'approval-requested')) {
    return 'approval-requested'
  }

  const hasRunning = parts.some((part) => RUNNING_STATES.has(part.state))
  if (hasRunning) {
    return 'input-available'
  }

  const allDone = parts.every((part) => DONE_STATES.has(part.state))
  if (allDone && parts.some((part) => part.state === 'output-error')) {
    return 'output-error'
  }

  if (allDone && parts.some((part) => part.state === 'output-denied')) {
    return 'output-denied'
  }

  return 'output-available'
}

function getToolSummary(toolName: string, count: number, isComplete: boolean): string {
  const noun = (single: string, plural: string = `${single}s`) =>
    count === 1 ? single : plural

  if (isComplete) {
    switch (toolName) {
      case 'Read':
        return `Read ${count} ${noun('file')}`
      case 'Edit':
        return `Edited ${count} ${noun('file')}`
      case 'Write':
        return `Wrote ${count} ${noun('file')}`
      case 'Bash':
        return `Ran ${count} ${noun('command')}`
      case 'Task':
        return `Ran ${count} ${noun('agent')}`
      case 'WebSearch':
        return `Ran ${count} ${noun('search')}`
      case 'WebFetch':
        return `Fetched ${count} ${noun('URL')}`
      default:
        return `Ran ${count} ${noun('tool')}`
    }
  }

  switch (toolName) {
    case 'Read':
      return `Reading ${count} ${noun('file')}...`
    case 'Edit':
      return `Editing ${count} ${noun('file')}...`
    case 'Write':
      return `Writing ${count} ${noun('file')}...`
    case 'Bash':
      return `Running ${count} ${noun('command')}...`
    case 'Task':
      return `Running ${count} ${noun('agent')}...`
    case 'WebSearch':
      return `Running ${count} ${noun('search')}...`
    case 'WebFetch':
      return `Fetching ${count} ${noun('URL')}...`
    default:
      return `Running ${count} ${noun('tool')}...`
  }
}

export function canGroupToolParts(parts: ToolPartUnion[]): boolean {
  if (parts.length < 2) {
    return false
  }

  if (parts.some((part) => part.state === 'approval-requested')) {
    return false
  }

  const family = getToolFamily(parts[0])
  return parts.every((part) => getToolFamily(part) === family)
}

export function ApertureToolGroup({ parts }: { parts: ToolPartUnion[] }) {
  const toolName = getToolFamily(parts[0])
  const state = getGroupState(parts)
  const isComplete = parts.every((part) => DONE_STATES.has(part.state))
  const summary = useMemo(
    () => getToolSummary(toolName, parts.length, isComplete),
    [isComplete, parts.length, toolName],
  )

  return (
    <Collapsible
      className="group mb-4 w-full min-w-0 max-w-full rounded-md border"
      defaultOpen={false}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 items-start justify-between gap-3 p-3 text-left">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <WrenchIcon className="size-4 shrink-0 text-foreground/40" />
          <span className="min-w-0 truncate font-medium text-sm">{summary}</span>
          <Badge className="max-w-full shrink-0 truncate" variant="outline" size="sm">
            {parts.length} calls
          </Badge>
          {getStatusBadge(state)}
        </div>
        <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-foreground/40 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          'min-w-0 max-w-full space-y-3 overflow-hidden px-3 pb-3',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
        )}
      >
        {parts.map((part) => (
          <ApertureToolPart
            key={part.toolCallId}
            part={part}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
