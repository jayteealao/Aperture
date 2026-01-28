import React from 'react'
import { cn } from '@/utils/cn'
import { HUDLabel } from './hud-base'
import { ChevronRight } from 'lucide-react'

interface AccordionContextType {
  openItems: string[]
  toggleItem: (id: string) => void
  type: 'single' | 'multiple'
}

const AccordionContext = React.createContext<AccordionContextType | null>(null)

function useAccordion() {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error('Accordion components must be used within Accordion')
  return context
}

export interface AccordionProps {
  children: React.ReactNode
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
  className?: string
}

export function Accordion({
  children,
  type = 'single',
  defaultValue,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = React.useState<string[]>(() => {
    if (!defaultValue) return []
    return Array.isArray(defaultValue) ? defaultValue : [defaultValue]
  })

  const toggleItem = React.useCallback(
    (id: string) => {
      setOpenItems((prev) => {
        if (type === 'single') {
          return prev.includes(id) ? [] : [id]
        }
        return prev.includes(id)
          ? prev.filter((item) => item !== id)
          : [...prev, id]
      })
    },
    [type]
  )

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem, type }}>
      <div className={cn('divide-y divide-hud-gray/50', className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

export interface AccordionItemProps {
  id: string
  children: React.ReactNode
  className?: string
}

export function AccordionItem({ children, className }: AccordionItemProps) {
  return <div className={cn('', className)}>{children}</div>
}

export interface AccordionTriggerProps {
  id: string
  children: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}

export function AccordionTrigger({
  id,
  children,
  icon,
  badge,
  className,
}: AccordionTriggerProps) {
  const { openItems, toggleItem } = useAccordion()
  const isOpen = openItems.includes(id)

  return (
    <button
      type="button"
      onClick={() => toggleItem(id)}
      className={cn(
        'w-full flex items-center gap-3 py-3 px-2',
        'text-left transition-colors',
        'hover:bg-hud-white/5',
        'focus:outline-none focus-visible:bg-hud-white/5',
        className
      )}
    >
      {/* Chevron indicator */}
      <ChevronRight
        className={cn(
          'w-4 h-4 text-hud-text transition-transform duration-200',
          isOpen && 'rotate-90 text-hud-accent'
        )}
      />

      {/* Icon */}
      {icon && (
        <span className={cn('w-5 h-5 text-hud-text', isOpen && 'text-hud-accent')}>
          {icon}
        </span>
      )}

      {/* Label */}
      <span className="flex-1">
        <HUDLabel className={isOpen ? 'text-hud-accent' : 'text-hud-white'}>
          {children}
        </HUDLabel>
      </span>

      {/* Badge */}
      {badge}
    </button>
  )
}

export interface AccordionContentProps {
  id: string
  children: React.ReactNode
  className?: string
}

export function AccordionContent({ id, children, className }: AccordionContentProps) {
  const { openItems } = useAccordion()
  const isOpen = openItems.includes(id)

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'pl-10 pr-4 pb-3',
        'animate-slide-down',
        className
      )}
    >
      {children}
    </div>
  )
}
