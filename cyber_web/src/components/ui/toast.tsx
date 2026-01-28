import React from 'react'
import { cn } from '@/utils/cn'
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react'

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export interface Toast {
  id: string
  title?: string
  message: string
  variant?: ToastVariant
  duration?: number
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextType | null>(null)

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 11)
    setToasts((prev) => [...prev, { id, ...toast }])

    // Auto-remove after duration
    const duration = toast.duration ?? 5000
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onClose: () => void
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const { title, message, variant = 'default' } = toast

  const variants = {
    default: 'border-hud-gray bg-hud-dark',
    success: 'border-hud-success/30 bg-hud-success/10',
    warning: 'border-hud-warning/30 bg-hud-warning/10',
    error: 'border-hud-error/30 bg-hud-error/10',
    info: 'border-hud-info/30 bg-hud-info/10',
  }

  const icons = {
    default: null,
    success: <CheckCircle className="w-5 h-5 text-hud-success" />,
    warning: <AlertTriangle className="w-5 h-5 text-hud-warning" />,
    error: <AlertCircle className="w-5 h-5 text-hud-error" />,
    info: <Info className="w-5 h-5 text-hud-info" />,
  }

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-4 border',
        'shadow-lg shadow-hud-black/50',
        'animate-slide-left',
        variants[variant]
      )}
    >
      {icons[variant]}
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-mono text-xs uppercase tracking-wider text-hud-white mb-1">
            {title}
          </p>
        )}
        <p className="text-sm text-hud-text">{message}</p>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 text-hud-text hover:text-hud-white transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Corner accents */}
      <span className="absolute top-0 left-0 w-2 h-px bg-hud-text/30" />
      <span className="absolute top-0 left-0 w-px h-2 bg-hud-text/30" />
      <span className="absolute bottom-0 right-0 w-2 h-px bg-hud-text/30" />
      <span className="absolute bottom-0 right-0 w-px h-2 bg-hud-text/30" />
    </div>
  )
}
