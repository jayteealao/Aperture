import { forwardRef, type TextareaHTMLAttributes, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/utils/cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  autoGrow?: boolean
  maxHeight?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, autoGrow = false, maxHeight = 200, id, onChange, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const internalRef = useRef<HTMLTextAreaElement>(null)

    const handleRef = (el: HTMLTextAreaElement | null) => {
      (internalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
      if (typeof ref === 'function') {
        ref(el)
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
      }
    }

    const adjustHeight = useCallback(() => {
      const textarea = internalRef.current
      if (textarea && autoGrow) {
        textarea.style.height = 'auto'
        const newHeight = Math.min(textarea.scrollHeight, maxHeight)
        textarea.style.height = `${newHeight}px`
      }
    }, [autoGrow, maxHeight])

    useEffect(() => {
      adjustHeight()
    }, [props.value, adjustHeight])

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
          >
            {label}
          </label>
        )}
        <textarea
          ref={handleRef}
          id={textareaId}
          className={cn(
            'w-full px-3 py-2 rounded-lg text-sm',
            'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
            'border border-[var(--color-border)]',
            'placeholder:text-[var(--color-text-muted)]',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
            'transition-all duration-200 resize-none',
            error && 'border-danger focus:ring-danger',
            className
          )}
          onChange={(e) => {
            adjustHeight()
            onChange?.(e)
          }}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        {hint && !error && (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{hint}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
