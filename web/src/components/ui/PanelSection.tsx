import * as Collapsible from '@radix-ui/react-collapsible'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'

interface PanelSectionProps {
  title: string
  /** Lucide icon component — rendered at size 14 inside the trigger. */
  icon: LucideIcon
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Collapsible panel section backed by Radix Collapsible.
 *
 * Shared by SdkControlPanel and PiControlPanel — both panels use
 * uncontrolled expand/collapse state so no lift is needed.
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
    <Collapsible.Root defaultOpen={defaultOpen} className="border-b border-(--color-border)">
      <Collapsible.Trigger className="group flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-(--color-surface-hover) transition-colors">
        <span className="text-(--color-text-muted)">
          <Icon size={14} />
        </span>
        <span className="flex-1 text-sm font-medium text-(--color-text-secondary)">{title}</span>
        <ChevronDown
          size={14}
          className="text-(--color-text-muted) transition-transform group-data-[state=open]:rotate-180"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="px-3 pb-3">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
