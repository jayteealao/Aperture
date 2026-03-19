import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { useState } from 'react'
import { cn } from '@/utils/cn'
import { Eye, EyeOff } from 'lucide-react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /** Applies error border/ring styling — use InputField for a visible error message. */
  error?: boolean
}

export function Input({
  className,
  leftIcon,
  rightIcon,
  error,
  type,
  ref,
  ...props
}: InputProps & { ref?: Ref<HTMLInputElement> }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  const inputClasses = cn(
    'w-full h-10 px-3 rounded-lg font-mono text-sm',
    'bg-secondary text-foreground',
    'border border-border',
    'placeholder:text-foreground/40',
    'focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent',
    'transition-all duration-200',
    leftIcon && 'pl-10',
    (rightIcon || isPassword) && 'pr-10',
    error && 'border-destructive focus:ring-destructive/50',
    className
  )

  // Fast path: no icons or password toggle — render bare <input> with no wrapper div.
  // This preserves InputGroup's direct-child CSS selectors (has-[>input], [&>input]).
  if (!leftIcon && !rightIcon && !isPassword) {
    return <input ref={ref} type={type} aria-invalid={error || undefined} className={inputClasses} {...props} />
  }

  return (
    <div className="relative">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40">
          {leftIcon}
        </div>
      )}
      <input
        ref={ref}
        type={isPassword && showPassword ? 'text' : type}
        aria-invalid={error || undefined}
        className={inputClasses}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-muted-foreground"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
      {rightIcon && !isPassword && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40">
          {rightIcon}
        </div>
      )}
    </div>
  )
}
