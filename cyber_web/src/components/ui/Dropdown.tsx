import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { ChevronDown, Check } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
  disabled?: boolean
  icon?: ReactNode
}

export interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
  hint?: string
  placeholder?: string
  className?: string
}

export function Dropdown({
  options,
  value,
  onChange,
  label,
  error,
  hint,
  placeholder = 'Select...',
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Find selected option
  const selectedOption = options.find((opt) => opt.value === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleSelect = (option: DropdownOption) => {
    if (option.disabled) return
    onChange(option.value)
    setIsOpen(false)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="block text-sm font-medium text-hud-text mb-2">
          {label}
        </label>
      )}
      <div ref={dropdownRef} className="relative">
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full h-10 px-3 pr-10 text-sm text-left',
            'bg-hud-gray/30 text-hud-text',
            'border border-hud-gray/50',
            'focus:outline-none focus:border-hud-accent',
            'transition-all duration-200',
            error && 'border-hud-error focus:border-hud-error'
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedOption?.icon}
            <span className={cn(!selectedOption && 'text-hud-text/50')}>
              {selectedOption?.label ?? placeholder}
            </span>
          </div>
          <ChevronDown
            size={18}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 text-hud-text/50 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div className="absolute z-[100] w-full mt-2 py-1 bg-hud-black border border-hud-gray/50 shadow-xl max-h-60 overflow-y-auto">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option)}
                disabled={option.disabled}
                className={cn(
                  'w-full px-3 py-2 text-left transition-colors',
                  'flex items-center gap-2',
                  'hover:bg-hud-gray/30',
                  option.disabled && 'opacity-50 cursor-not-allowed',
                  option.value === value && 'bg-hud-accent/20'
                )}
              >
                {option.icon && (
                  <span className="shrink-0">{option.icon}</span>
                )}
                <span className="flex-1 text-sm text-hud-text">
                  {option.label}
                </span>
                {option.value === value && (
                  <Check size={16} className="text-hud-success shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-hud-error">{error}</p>}
      {hint && !error && (
        <p className="mt-1 text-sm text-hud-text/50">{hint}</p>
      )}
    </div>
  )
}

Dropdown.displayName = 'Dropdown'
