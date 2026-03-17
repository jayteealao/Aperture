import {
  useEffect,
  useRef,
  useCallback,
  type MutableRefObject,
  type Ref,
} from 'react'
import { cn } from '@/utils/cn'
import { Textarea } from './textarea'

export interface TextareaFieldProps
  extends React.ComponentProps<typeof Textarea> {
  label?: string
  error?: string
  hint?: string
  /**
   * Auto-grow the textarea to fit its content.
   * Uses CSS `field-sizing-content` where supported, falls back to JS height
   * adjustment for older environments.
   */
  autoGrow?: boolean
  maxHeight?: number
}

export function TextareaField({
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
}: TextareaFieldProps & { ref?: Ref<HTMLTextAreaElement> }) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const internalRef = useRef<HTMLTextAreaElement>(null)

  // Merge external ref with internal ref
  const handleRef = (el: HTMLTextAreaElement | null) => {
    internalRef.current = el
    if (typeof ref === 'function') {
      ref(el)
    } else if (ref) {
      ;(ref as MutableRefObject<HTMLTextAreaElement | null>).current = el
    }
  }

  // JS height fallback for browsers that don't support field-sizing-content
  const adjustHeight = useCallback(() => {
    const el = internalRef.current
    if (!el || !autoGrow) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [autoGrow, maxHeight])

  useEffect(() => {
    adjustHeight()
  }, [props.value, adjustHeight])

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-muted-foreground"
        >
          {label}
        </label>
      )}
      <Textarea
        ref={handleRef}
        id={textareaId}
        className={cn(
          autoGrow && 'field-sizing-content',
          error && 'border-destructive focus-visible:ring-destructive/20',
          className
        )}
        style={{ maxHeight: autoGrow ? maxHeight : undefined }}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error && textareaId
            ? `${textareaId}-error`
            : hint && textareaId
            ? `${textareaId}-hint`
            : undefined
        }
        onChange={(e) => {
          adjustHeight()
          onChange?.(e)
        }}
        {...props}
      />
      {error && (
        <p id={`${textareaId}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${textareaId}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}
