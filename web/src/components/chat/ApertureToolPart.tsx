import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import { getToolName } from 'ai'
import { Tool, ToolContent, ToolHeader, ToolOutput } from '@/components/ai-elements/tool'
import { ToolInputDisplay } from '@/components/sdk/ToolInputDisplay'

type ToolPartUnion = ToolUIPart | DynamicToolUIPart

/**
 * Renders a single tool invocation part using ai-elements Tool chrome
 * with our custom ToolInputDisplay for tool-specific rendering (Bash, Read, Edit, etc.).
 *
 * We bypass ai-elements' ToolInput (which only renders JSON.stringify CodeBlock)
 * in favor of ToolInputDisplay which has per-tool formatting.
 */
export function ApertureToolPart({ part }: { part: ToolPartUnion }) {
  // Use AI SDK's getToolName() — handles both static (tool-{NAME}) and dynamic-tool parts
  const toolName = getToolName(part)

  return (
    <Tool defaultOpen={part.state !== 'output-available'}>
      {part.type === 'dynamic-tool' ? (
        <ToolHeader
          state={part.state}
          title={toolName}
          toolName={toolName}
          type={part.type}
        />
      ) : (
        <ToolHeader state={part.state} title={toolName} type={part.type} />
      )}
      <ToolContent>
        {part.input !== undefined && (
          <ToolInputDisplay input={part.input} name={toolName} />
        )}
        <ToolOutput
          errorText={'errorText' in part ? part.errorText : undefined}
          output={'output' in part ? part.output : undefined}
        />
      </ToolContent>
    </Tool>
  )
}
