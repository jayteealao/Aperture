import React from 'react'
import { cn } from '@/utils/cn'
import { HUDLabel } from './hud-base'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
}

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select...',
  error,
  disabled = false,
  className,
}: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={cn('w-full', className)} ref={ref}>
      {label && (
        <label className="block mb-2">
          <HUDLabel className={error ? 'text-hud-error' : ''}>{label}</HUDLabel>
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className={cn(
            'w-full flex items-center justify-between',
            'bg-hud-dark border border-hud-gray',
            'font-mono text-sm text-left',
            'py-2 px-3',
            'transition-colors duration-200',
            'focus:outline-none focus:border-hud-accent focus:ring-1 focus:ring-hud-accent/30',
            error && 'border-hud-error',
            disabled && 'opacity-50 cursor-not-allowed',
            !disabled && 'hover:border-hud-text/50'
          )}
        >
          <span className={selectedOption ? 'text-hud-white' : 'text-hud-text/50'}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-hud-text transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        {/* Corner accents */}
        <span className="absolute top-0 left-0 w-2 h-px bg-hud-text/30" />
        <span className="absolute top-0 left-0 w-px h-2 bg-hud-text/30" />
        <span className="absolute bottom-0 right-0 w-2 h-px bg-hud-text/30" />
        <span className="absolute bottom-0 right-0 w-px h-2 bg-hud-text/30" />

        {/* Dropdown */}
        {open && (
          <div
            className={cn(
              'absolute z-50 w-full mt-1',
              'bg-hud-dark border border-hud-gray',
              'shadow-lg shadow-hud-black/50',
              'max-h-60 overflow-auto',
              'animate-slide-down'
            )}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left',
                  'font-mono text-sm',
                  'transition-colors',
                  option.disabled
                    ? 'text-hud-text/30 cursor-not-allowed'
                    : 'hover:bg-hud-white/5',
                  option.value === value && 'text-hud-accent bg-hud-accent/10'
                )}
              >
                <div>
                  <div className={option.value === value ? 'text-hud-accent' : 'text-hud-white'}>
                    {option.label}
                  </div>
                  {option.description && (
                    <div className="text-2xs text-hud-text">{option.description}</div>
                  )}
                </div>
                {option.value === value && <Check className="w-4 h-4 text-hud-accent" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-2xs font-mono text-hud-error">{error}</p>}
    </div>
  )
}
