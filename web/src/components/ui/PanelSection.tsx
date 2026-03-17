"use client"

import type { ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface PanelSectionProps {
  title: string
  /** Lucide icon component — rendered at size 14 inside the trigger. */
  icon: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * Collapsible panel section backed by the project's Radix Collapsible wrapper.
 *
 * Shared by SdkControlPanel and PiControlPanel — both use uncontrolled
 * expand/collapse state so no external state management is needed.
 *
 * `group` lives on <Collapsible> (the root) so group-data-[state=open] reads
 * data-state from the nearest group ancestor — matching the established pattern
 * in tool.tsx and reasoning.tsx. Placing group on the trigger is fragile because
 * it relies on the trigger and data-state bearer being the same DOM node.
 */
export function PanelSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: PanelSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group border-b border-(--color-border)">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-(--color-surface-hover) transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <span className="text-(--color-text-muted)" aria-hidden="true">
          <Icon size={14} />
        </span>
        <span className="flex-1 text-sm font-medium text-(--color-text-secondary)">{title}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="text-(--color-text-muted) transition-transform group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up px-3 py-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
