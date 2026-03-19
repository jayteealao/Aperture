import type { Ref, SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
  placeholder?: string
}

export function FormSelect({
  className,
  label,
  error,
  hint,
  options,
  placeholder,
  id,
  ref,
  ...props
}: FormSelectProps & { ref?: Ref<HTMLSelectElement> }) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-muted-foreground mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'w-full h-10 px-3 pr-10 rounded-lg font-mono text-sm appearance-none',
            'bg-secondary text-foreground',
            'border border-border',
            'focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent',
            'transition-all duration-200 cursor-pointer',
            'scheme-dark',
            error && 'border-destructive focus:ring-destructive/50',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={18}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none"
        />
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      {hint && !error && (
        <p className="mt-1 text-sm text-foreground/40">{hint}</p>
      )}
    </div>
  )
}
