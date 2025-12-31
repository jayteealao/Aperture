import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from './Spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = cn(
      'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200',
      'focus-ring rounded-lg disabled:opacity-50 disabled:cursor-not-allowed',
      'active:scale-[0.98]'
    )

    const variants = {
      primary: cn(
        'bg-accent text-[#0a0a0f] hover:bg-accent-hover',
        'shadow-md hover:shadow-lg hover:shadow-accent/20'
      ),
      secondary: cn(
        'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]',
        'hover:border-[var(--color-border-strong)]'
      ),
      ghost: cn(
        'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
        'hover:bg-[var(--color-surface)]'
      ),
      danger: cn(
        'bg-danger text-white hover:bg-danger/90',
        'shadow-md hover:shadow-lg hover:shadow-danger/20'
      ),
      outline: cn(
        'border-2 border-accent text-accent hover:bg-accent hover:text-[#0a0a0f]'
      ),
    }

    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Spinner size="sm" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        {children}
        {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
