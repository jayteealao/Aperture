import { cn } from '@/utils/cn'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div className={cn('relative', sizes[size], className)}>
      {/* Outer ring */}
      <div className="absolute inset-0 border border-hud-gray rounded-full" />
      {/* Spinning segment */}
      <div className="absolute inset-0 border border-transparent border-t-hud-accent rounded-full animate-spin" />
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1 h-1 bg-hud-accent rounded-full animate-pulse" />
      </div>
    </div>
  )
}

// Loading overlay
export interface LoadingOverlayProps {
  visible: boolean
  message?: string
  className?: string
}

export function LoadingOverlay({ visible, message, className }: LoadingOverlayProps) {
  if (!visible) return null

  return (
    <div
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center',
        'bg-hud-black/80 backdrop-blur-sm',
        'animate-fade-in',
        className
      )}
    >
      <Spinner size="lg" />
      {message && (
        <p className="mt-4 font-mono text-xs text-hud-text tracking-wider uppercase">
          {message}
        </p>
      )}
    </div>
  )
}

// Skeleton loading placeholder
export interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rectangular' | 'circular'
  width?: string | number
  height?: string | number
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  const variants = {
    text: 'h-4 rounded',
    rectangular: 'rounded',
    circular: 'rounded-full',
  }

  return (
    <div
      className={cn(
        'bg-hud-gray/30 animate-pulse',
        variants[variant],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}
