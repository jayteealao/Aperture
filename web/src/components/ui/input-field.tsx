import type { InputProps } from './input'
import { Input } from './input'

export interface InputFieldProps extends Omit<InputProps, 'error'> {
  label?: string
  /** Visible error message — also applies error border styling to the input. */
  error?: string
  hint?: string
}

export function InputField({
  label,
  error,
  hint,
  id,
  ...props
}: InputFieldProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const errorId = error && inputId ? `${inputId}-error` : undefined
  const hintId = hint && !error && inputId ? `${inputId}-hint` : undefined

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-muted-foreground mb-2"
        >
          {label}
        </label>
      )}
      <Input
        id={inputId}
        error={!!error}
        aria-describedby={errorId ?? hintId}
        {...props}
      />
      {error && <p id={errorId} className="mt-1 text-sm text-danger">{error}</p>}
      {hint && !error && (
        <p id={hintId} className="mt-1 text-sm text-foreground/40">{hint}</p>
      )}
    </div>
  )
}
