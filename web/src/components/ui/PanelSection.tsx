import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface PanelSectionProps {
  title: string
  /** Lucide icon component — rendered at size 14 inside the trigger. */
  icon: LucideIcon
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Collapsible panel section backed by the project's Radix Collapsible wrapper.
 *
 * Shared by SdkControlPanel and PiControlPanel — both use uncontrolled
 * expand/collapse state so no external state management is needed.
 *
 * The chevron rotates 180° when open via group-data-[state=open] since
 * Radix sets data-state="open|closed" on the Trigger element and we need
 * to target a child element (ChevronDown) rather than the trigger itself.
 */
export function PanelSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: PanelSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-b border-(--color-border)">
      <CollapsibleTrigger className="group flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-(--color-surface-hover) transition-colors">
        <span className="text-(--color-text-muted)">
          <Icon size={14} />
        </span>
        <span className="flex-1 text-sm font-medium text-(--color-text-secondary)">{title}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="text-(--color-text-muted) transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden px-3 pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
