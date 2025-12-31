import { Fragment, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'
import { Button } from './Button'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  hideClose?: boolean
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  hideClose = false,
}: DialogProps) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'w-full glass-strong rounded-2xl shadow-2xl animate-slide-up',
            sizes[size]
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'dialog-title' : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || !hideClose) && (
            <div className="flex items-center justify-between p-6 pb-0">
              <div>
                {title && (
                  <h2
                    id="dialog-title"
                    className="text-lg font-semibold text-[var(--color-text-primary)]"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
                  aria-label="Close dialog"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </Fragment>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} size="sm">
      <div className="flex gap-3 justify-end pt-4">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : variant === 'warning' ? 'secondary' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmText}
        </Button>
      </div>
    </Dialog>
  )
}
