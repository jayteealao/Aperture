/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((prev) => [...prev, { ...toast, id }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }

  const toast = useCallback(
    (type: ToastType, title: string, message?: string, duration?: number) => {
      context.addToast({ type, title, message, duration })
    },
    [context]
  )

  return {
    toast,
    success: (title: string, message?: string) => toast('success', title, message),
    error: (title: string, message?: string) => toast('error', title, message),
    warning: (title: string, message?: string) => toast('warning', title, message),
    info: (title: string, message?: string) => toast('info', title, message),
  }
}

function ToastContainer() {
  const context = useContext(ToastContext)
  if (!context) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {context.toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => context.removeToast(toast.id)} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onClose: () => void
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const { type, title, message, duration = 5000 } = toast

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [duration, onClose])

  const icons = {
    success: <CheckCircle size={20} className="text-success" />,
    error: <AlertCircle size={20} className="text-danger" />,
    warning: <AlertTriangle size={20} className="text-warning" />,
    info: <Info size={20} className="text-accent" />,
  }

  const borders = {
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
    info: 'border-l-accent',
  }

  return (
    <div
      className={cn(
        'glass-strong rounded-lg p-4 shadow-xl pointer-events-auto animate-slide-left border-l-4',
        borders[type]
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icons[type]}</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text-primary)]">{title}</p>
          {message && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">{message}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
