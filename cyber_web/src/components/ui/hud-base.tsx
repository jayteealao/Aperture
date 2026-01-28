import React from 'react'
import { cn } from '@/utils/cn'

// =============================================================================
// Grid Container - The foundational HUD background with grid pattern
// =============================================================================

interface GridContainerProps {
  children: React.ReactNode
  className?: string
  showGrid?: boolean
  showVignette?: boolean
  showScanline?: boolean
}

export function GridContainer({
  children,
  className,
  showGrid = true,
  showVignette = true,
  showScanline = false,
}: GridContainerProps) {
  return (
    <div className={cn('relative bg-hud-black text-hud-white overflow-hidden', className)}>
      {/* Grid Pattern Overlay */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none z-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(to right, #1A1A1A 1px, transparent 1px), linear-gradient(to bottom, #1A1A1A 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      )}

      {/* Vignette Effect */}
      {showVignette && (
        <div className="absolute inset-0 pointer-events-none z-0 bg-gradient-radial from-transparent to-hud-black/70" />
      )}

      {/* Scanline Effect */}
      {showScanline && <div className="absolute inset-0 pointer-events-none z-0 hud-scanline" />}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}

// =============================================================================
// Typography Components
// =============================================================================

interface TypographyProps {
  children: React.ReactNode
  className?: string
}

// Micro data label (7-8px)
export function HUDMicro({ children, className }: TypographyProps) {
  return (
    <span className={cn('font-mono text-3xs tracking-widest text-hud-text/60 uppercase', className)}>
      {children}
    </span>
  )
}

// Small label (10px)
export function HUDLabel({ children, className }: TypographyProps) {
  return (
    <span className={cn('font-mono text-2xs tracking-widest text-hud-text uppercase', className)}>
      {children}
    </span>
  )
}

// Body text (12-14px)
export function HUDText({ children, className }: TypographyProps) {
  return <span className={cn('font-sans text-sm text-hud-white/90', className)}>{children}</span>
}

// Data readout (mono)
export function HUDData({ children, className }: TypographyProps) {
  return (
    <span className={cn('font-mono text-xs tracking-wider text-hud-silver', className)}>
      {children}
    </span>
  )
}

// Heading level 2 (18-22px)
export function HUDHeading({ children, className }: TypographyProps) {
  return (
    <h2 className={cn('font-sans text-xl font-semibold tracking-wide uppercase text-hud-white', className)}>
      {children}
    </h2>
  )
}

// Heading level 1 (28-32px)
export function HUDTitle({ children, className }: TypographyProps) {
  return (
    <h1 className={cn('font-sans text-2xl font-semibold tracking-wide uppercase text-hud-white', className)}>
      {children}
    </h1>
  )
}

// Display text (48-64px)
export function HUDDisplay({ children, className }: TypographyProps) {
  return (
    <span className={cn('font-sans text-6xl font-light tracking-tighter text-hud-white', className)}>
      {children}
    </span>
  )
}

// Accent text with glow
export function HUDAccent({ children, className }: TypographyProps) {
  return (
    <span className={cn('text-hud-accent text-glow-accent', className)}>
      {children}
    </span>
  )
}

// =============================================================================
// Decorators - Visual elements for HUD feel
// =============================================================================

interface CrosshairProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

export function Crosshair({ className, size = 'md', color }: CrosshairProps) {
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  }

  return (
    <div className={cn('relative flex items-center justify-center pointer-events-none', sizes[size], className)}>
      <div className={cn('absolute w-full h-px', color || 'bg-hud-text/50')} />
      <div className={cn('absolute h-full w-px', color || 'bg-hud-text/50')} />
    </div>
  )
}

interface CornerBracketProps {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  className?: string
  size?: 'sm' | 'md' | 'lg'
  accent?: boolean
}

export function CornerBracket({ position, className, size = 'md', accent = false }: CornerBracketProps) {
  const positions = {
    'top-left': 'top-0 left-0 border-t border-l',
    'top-right': 'top-0 right-0 border-t border-r',
    'bottom-left': 'bottom-0 left-0 border-b border-l',
    'bottom-right': 'bottom-0 right-0 border-b border-r',
  }

  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  }

  return (
    <div
      className={cn(
        'absolute pointer-events-none',
        positions[position],
        sizes[size],
        accent ? 'border-hud-accent' : 'border-hud-white/40',
        className
      )}
    />
  )
}

// All four corners at once
interface CornersProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  accent?: boolean
}

export function Corners({ className, size = 'md', accent = false }: CornersProps) {
  return (
    <>
      <CornerBracket position="top-left" size={size} accent={accent} className={className} />
      <CornerBracket position="top-right" size={size} accent={accent} className={className} />
      <CornerBracket position="bottom-left" size={size} accent={accent} className={className} />
      <CornerBracket position="bottom-right" size={size} accent={accent} className={className} />
    </>
  )
}

// Horizontal line separator with optional endpoints
interface HUDSeparatorProps {
  className?: string
  accent?: boolean
  showEndpoints?: boolean
}

export function HUDSeparator({ className, accent = false, showEndpoints = true }: HUDSeparatorProps) {
  return (
    <div className={cn('w-full h-px relative my-4', accent ? 'bg-hud-accent/50' : 'bg-hud-gray', className)}>
      {showEndpoints && (
        <>
          <div
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1',
              accent ? 'bg-hud-accent' : 'bg-hud-white/50'
            )}
          />
          <div
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1',
              accent ? 'bg-hud-accent' : 'bg-hud-white/50'
            )}
          />
        </>
      )}
    </div>
  )
}

// Status dot indicator
interface StatusDotProps {
  status: 'connected' | 'disconnected' | 'connecting' | 'error' | 'idle'
  className?: string
  pulse?: boolean
}

export function StatusDot({ status, className, pulse = false }: StatusDotProps) {
  const colors = {
    connected: 'bg-hud-success',
    disconnected: 'bg-hud-text',
    connecting: 'bg-hud-warning',
    error: 'bg-hud-error',
    idle: 'bg-hud-text/50',
  }

  const glows = {
    connected: 'shadow-glow-success',
    disconnected: '',
    connecting: '',
    error: 'shadow-[0_0_8px_rgba(255,51,51,0.5)]',
    idle: '',
  }

  return (
    <span
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full',
        colors[status],
        glows[status],
        pulse && 'animate-pulse',
        className
      )}
    />
  )
}

// Active indicator with label
interface ActiveIndicatorProps {
  label: string
  active?: boolean
  className?: string
}

export function ActiveIndicator({ label, active = false, className }: ActiveIndicatorProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <StatusDot status={active ? 'connected' : 'idle'} pulse={active} />
      <HUDLabel className={active ? 'text-hud-accent' : ''}>{label}</HUDLabel>
    </div>
  )
}

// Progress bar with HUD styling
interface HUDProgressProps {
  value: number
  max?: number
  className?: string
  showValue?: boolean
  label?: string
}

export function HUDProgress({ value, max = 100, className, showValue = false, label }: HUDProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <HUDLabel>{label}</HUDLabel>}
          {showValue && <HUDData>{value.toFixed(0)}/{max}</HUDData>}
        </div>
      )}
      <div className="h-1 bg-hud-gray relative overflow-hidden">
        <div
          className="h-full bg-hud-accent transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
        {/* Scan effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-scan" />
      </div>
    </div>
  )
}

// Coordinate display (like X: 0.00 Y: 0.00)
interface CoordinateDisplayProps {
  x?: number | string
  y?: number | string
  label?: string
  className?: string
}

export function CoordinateDisplay({ x, y, label, className }: CoordinateDisplayProps) {
  return (
    <div className={cn('font-mono text-2xs text-hud-text/70 flex items-center gap-2', className)}>
      {label && <span className="text-hud-text/50">{label}:</span>}
      {x !== undefined && (
        <span>
          <span className="text-hud-text/40">X:</span>
          <span className="text-hud-silver ml-0.5">{typeof x === 'number' ? x.toFixed(2) : x}</span>
        </span>
      )}
      {y !== undefined && (
        <span>
          <span className="text-hud-text/40">Y:</span>
          <span className="text-hud-silver ml-0.5">{typeof y === 'number' ? y.toFixed(2) : y}</span>
        </span>
      )}
    </div>
  )
}
