import {
  useEffect,
  useRef,
  useCallback,
  type MutableRefObject,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/utils/cn'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  autoGrow?: boolean
  maxHeight?: number
}

export function Textarea({
  className,
  label,
  error,
  hint,
  autoGrow = false,
  maxHeight = 200,
  id,
  onChange,
  ref,
  ...props
}: TextareaProps & { ref?: Ref<HTMLTextAreaElement> }) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
  const internalRef = useRef<HTMLTextAreaElement>(null)

  const handleRef = (el: HTMLTextAreaElement | null) => {
    internalRef.current = el
    if (typeof ref === 'function') {
      ref(el)
    } else if (ref) {
      ;(ref as MutableRefObject<HTMLTextAreaElement | null>).current = el
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
          className="block text-sm font-medium text-(--color-text-secondary) mb-2"
        >
          {label}
        </label>
      )}
      <textarea
        ref={handleRef}
        id={textareaId}
        className={cn(
          'w-full px-3 py-2 rounded-lg text-sm',
          'bg-(--color-surface) text-(--color-text-primary)',
          'border border-(--color-border)',
          'placeholder:text-(--color-text-muted)',
          'focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent',
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
        <p className="mt-1 text-sm text-(--color-text-muted)">{hint}</p>
      )}
    </div>
  )
}
