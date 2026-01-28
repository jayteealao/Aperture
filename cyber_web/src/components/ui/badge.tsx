import React from 'react'
import { cn } from '@/utils/cn'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'outline'
  size?: 'sm' | 'md'
  pulse?: boolean
  className?: string
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  pulse = false,
  className,
}: BadgeProps) {
  const variants = {
    default: 'bg-hud-gray text-hud-white border border-hud-gray',
    accent: 'bg-hud-accent/10 text-hud-accent border border-hud-accent/30',
    success: 'bg-hud-success/10 text-hud-success border border-hud-success/30',
    warning: 'bg-hud-warning/10 text-hud-warning border border-hud-warning/30',
    error: 'bg-hud-error/10 text-hud-error border border-hud-error/30',
    outline: 'bg-transparent text-hud-text border border-hud-gray',
  }

  const sizes = {
    sm: 'text-2xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono uppercase tracking-wider',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {pulse && (
        <span
          className={cn('w-1 h-1 rounded-full animate-pulse', {
            'bg-hud-white': variant === 'default',
            'bg-hud-accent': variant === 'accent',
            'bg-hud-success': variant === 'success',
            'bg-hud-warning': variant === 'warning',
            'bg-hud-error': variant === 'error',
            'bg-hud-text': variant === 'outline',
          })}
        />
      )}
      {children}
    </span>
  )
}

// Tag variant - clickable badge
export interface TagProps extends BadgeProps {
  onClick?: () => void
  onRemove?: () => void
  active?: boolean
}

export function Tag({ onClick, onRemove, active = false, children, className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        onClick && 'cursor-pointer hover:border-hud-accent hover:text-hud-accent transition-colors',
        className
      )}
      onClick={onClick}
    >
      <Badge variant={active ? 'accent' : 'outline'} pulse={active} {...props}>
        {children}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="ml-1 hover:text-hud-error transition-colors"
          >
            ×
          </button>
        )}
      </Badge>
    </span>
  )
}
