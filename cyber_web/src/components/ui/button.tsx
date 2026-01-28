import React from 'react'
import { cn } from '@/utils/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary: cn(
        'bg-hud-accent text-white border border-hud-accent',
        'hover:bg-hud-accent-bright hover:border-hud-accent-bright',
        'active:bg-hud-accent-dark',
        'disabled:bg-hud-gray disabled:border-hud-gray disabled:text-hud-text'
      ),
      secondary: cn(
        'bg-hud-gray text-hud-white border border-hud-gray',
        'hover:bg-hud-gray-light hover:border-hud-text/30',
        'active:bg-hud-dark',
        'disabled:text-hud-text/50'
      ),
      ghost: cn(
        'bg-transparent text-hud-text border border-transparent',
        'hover:text-hud-white hover:bg-hud-white/5',
        'active:bg-hud-white/10',
        'disabled:text-hud-text/30'
      ),
      outline: cn(
        'bg-transparent text-hud-white border border-hud-gray',
        'hover:border-hud-accent hover:text-hud-accent',
        'active:bg-hud-accent/10',
        'disabled:border-hud-gray/50 disabled:text-hud-text/50'
      ),
      danger: cn(
        'bg-hud-error/10 text-hud-error border border-hud-error/30',
        'hover:bg-hud-error/20 hover:border-hud-error/50',
        'active:bg-hud-error/30',
        'disabled:bg-hud-gray disabled:border-hud-gray disabled:text-hud-text'
      ),
    }

    const sizes = {
      sm: 'text-xs py-1 px-2 gap-1',
      md: 'text-sm py-2 px-4 gap-2',
      lg: 'text-base py-3 px-6 gap-2',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          // Base styles
          'relative inline-flex items-center justify-center',
          'font-mono uppercase tracking-wider',
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent focus-visible:ring-offset-2 focus-visible:ring-offset-hud-black',
          // Variant
          variants[variant],
          // Size
          sizes[size],
          // Loading state
          loading && 'cursor-wait',
          className
        )}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center bg-inherit">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}

        {/* Content */}
        <span className={cn('inline-flex items-center gap-inherit', loading && 'invisible')}>
          {icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span className="shrink-0">{icon}</span>}
        </span>

        {/* HUD corner accent for primary variant */}
        {variant === 'primary' && (
          <>
            <span className="absolute top-0 left-0 w-1 h-1 bg-white/30" />
            <span className="absolute bottom-0 right-0 w-1 h-1 bg-white/30" />
          </>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

// Icon-only button variant
export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'iconPosition' | 'children'> {
  icon: React.ReactNode
  label: string
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, variant = 'ghost', size = 'md', className, ...props }, ref) => {
    const sizes = {
      sm: 'w-6 h-6',
      md: 'w-8 h-8',
      lg: 'w-10 h-10',
    }

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn('!p-0', sizes[size], className)}
        aria-label={label}
        title={label}
        {...props}
      >
        {icon}
      </Button>
    )
  }
)

IconButton.displayName = 'IconButton'
