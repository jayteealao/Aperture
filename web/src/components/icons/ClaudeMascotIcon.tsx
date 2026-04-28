import { memo } from 'react'
import { cn } from '@/utils/cn'

interface ClaudeMascotIconProps {
  size?: number
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

const ClaudeMascotIconInner = ({
  size = 20,
  className,
  'aria-hidden': ariaHidden,
}: ClaudeMascotIconProps) => {
  const decorative = ariaHidden === true || ariaHidden === 'true'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 15 16"
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : 'Claude Code'}
      aria-hidden={ariaHidden}
      data-slot="clawd-mascot"
      shapeRendering="crispEdges"
      className={cn('transition-colors duration-300', className)}
      style={{ width: size, height: size }}
    >
      <g fill="currentColor">
        <rect x="2" y="6" width="11" height="7" />
        <rect x="0" y="9" width="2" height="2" />
        <rect x="13" y="9" width="2" height="2" />
        <rect x="3" y="13" width="1" height="2" />
        <rect x="5" y="13" width="1" height="2" />
        <rect x="9" y="13" width="1" height="2" />
        <rect x="11" y="13" width="1" height="2" />
      </g>
      <g fill="var(--foreground)">
        <rect x="4" y="8" width="1" height="2" />
        <rect x="10" y="8" width="1" height="2" />
      </g>
    </svg>
  )
}

export const ClaudeMascotIcon = memo(ClaudeMascotIconInner)
