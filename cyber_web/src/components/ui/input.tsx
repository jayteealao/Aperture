import React from 'react'
import { cn } from '@/utils/cn'
import { HUDLabel } from './hud-base'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconPosition = 'left', className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block mb-2">
            <HUDLabel className={error ? 'text-hud-error' : ''}>{label}</HUDLabel>
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-hud-text pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              // Base
              'w-full bg-hud-dark border border-hud-gray',
              'font-mono text-sm text-hud-white placeholder:text-hud-text/50',
              'py-2 px-3',
              'transition-colors duration-200',
              // Focus
              'focus:outline-none focus:border-hud-accent focus:ring-1 focus:ring-hud-accent/30',
              // Error
              error && 'border-hud-error focus:border-hud-error focus:ring-hud-error/30',
              // Disabled
              'disabled:bg-hud-gray/30 disabled:text-hud-text/50 disabled:cursor-not-allowed',
              // Icon padding
              icon && iconPosition === 'left' && 'pl-10',
              icon && iconPosition === 'right' && 'pr-10',
              className
            )}
            {...props}
          />
          {icon && iconPosition === 'right' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-hud-text pointer-events-none">
              {icon}
            </div>
          )}
          {/* Corner accents */}
          <span className="absolute top-0 left-0 w-2 h-px bg-hud-text/30" />
          <span className="absolute top-0 left-0 w-px h-2 bg-hud-text/30" />
          <span className="absolute bottom-0 right-0 w-2 h-px bg-hud-text/30" />
          <span className="absolute bottom-0 right-0 w-px h-2 bg-hud-text/30" />
        </div>
        {(error || hint) && (
          <p
            className={cn(
              'mt-1 text-2xs font-mono',
              error ? 'text-hud-error' : 'text-hud-text/70'
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

// Textarea variant
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block mb-2">
            <HUDLabel className={error ? 'text-hud-error' : ''}>{label}</HUDLabel>
          </label>
        )}
        <div className="relative">
          <textarea
            ref={ref}
            id={inputId}
            className={cn(
              // Base
              'w-full bg-hud-dark border border-hud-gray',
              'font-mono text-sm text-hud-white placeholder:text-hud-text/50',
              'py-2 px-3 min-h-[80px] resize-y',
              'transition-colors duration-200',
              // Focus
              'focus:outline-none focus:border-hud-accent focus:ring-1 focus:ring-hud-accent/30',
              // Error
              error && 'border-hud-error focus:border-hud-error focus:ring-hud-error/30',
              // Disabled
              'disabled:bg-hud-gray/30 disabled:text-hud-text/50 disabled:cursor-not-allowed',
              className
            )}
            {...props}
          />
          {/* Corner accents */}
          <span className="absolute top-0 left-0 w-2 h-px bg-hud-text/30" />
          <span className="absolute top-0 left-0 w-px h-2 bg-hud-text/30" />
          <span className="absolute bottom-0 right-0 w-2 h-px bg-hud-text/30" />
          <span className="absolute bottom-0 right-0 w-px h-2 bg-hud-text/30" />
        </div>
        {(error || hint) && (
          <p
            className={cn(
              'mt-1 text-2xs font-mono',
              error ? 'text-hud-error' : 'text-hud-text/70'
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
