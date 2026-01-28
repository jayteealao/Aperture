import React from 'react'
import { cn } from '@/utils/cn'
import { Corners, HUDLabel, Crosshair } from './hud-base'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'accent' | 'ghost'
  corners?: boolean
  crosshairs?: boolean
  header?: React.ReactNode
  footer?: React.ReactNode
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      variant = 'default',
      corners = true,
      crosshairs = false,
      header,
      footer,
      className,
      ...props
    },
    ref
  ) => {
    const variants = {
      default: 'bg-hud-dark/80 border border-hud-gray',
      bordered: 'bg-hud-black border border-hud-gray',
      accent: 'bg-hud-dark/80 border border-hud-accent/30 shadow-glow',
      ghost: 'bg-transparent border border-hud-gray/50',
    }

    return (
      <div
        ref={ref}
        className={cn('relative', variants[variant], className)}
        {...props}
      >
        {/* Decorators */}
        {corners && <Corners size="sm" accent={variant === 'accent'} />}
        {crosshairs && (
          <>
            <Crosshair className="absolute -top-1.5 -left-1.5" size="sm" />
            <Crosshair className="absolute -bottom-1.5 -right-1.5" size="sm" />
          </>
        )}

        {/* Header */}
        {header && (
          <div className="px-4 py-3 border-b border-hud-gray/50">
            {typeof header === 'string' ? (
              <HUDLabel className="text-hud-white">{header}</HUDLabel>
            ) : (
              header
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-4">{children}</div>

        {/* Footer */}
        {footer && <div className="px-4 py-3 border-t border-hud-gray/50">{footer}</div>}
      </div>
    )
  }
)

Card.displayName = 'Card'

// Stat card variant for displaying single metrics
export interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  accent?: boolean
  className?: string
}

export function StatCard({ label, value, subtext, accent = false, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col border-l-2 pl-3 py-1',
        accent ? 'border-hud-accent' : 'border-hud-gray',
        className
      )}
    >
      <HUDLabel className="mb-1">{label}</HUDLabel>
      <div
        className={cn(
          'text-2xl font-sans font-medium',
          accent ? 'text-hud-accent' : 'text-hud-white'
        )}
      >
        {value}
      </div>
      {subtext && <div className="text-2xs font-mono text-hud-accent mt-0.5">{subtext}</div>}
    </div>
  )
}

// Data row for key-value pairs
export interface DataRowProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function DataRow({ label, value, className }: DataRowProps) {
  return (
    <div className={cn('flex justify-between items-center py-1', className)}>
      <HUDLabel>{label}</HUDLabel>
      <span className="font-mono text-xs text-hud-white">{value}</span>
    </div>
  )
}
