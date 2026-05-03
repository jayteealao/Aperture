import { memo } from 'react'

import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-debugger-body-hunch {
  transform-origin: 7.5px 15px;
  animation: clawd-debugger-hunch-walk 2s infinite alternate ease-in-out;
}
.clawd-debugger-magnifying-glass {
  transform-origin: 14px 10px;
  animation: clawd-debugger-search-glass 3s infinite ease-in-out;
}
.clawd-debugger-leg-1 {
  animation: clawd-debugger-sneak-1 0.5s infinite linear;
  transform-origin: top center;
  transform-box: fill-box;
}
.clawd-debugger-leg-2 {
  animation: clawd-debugger-sneak-2 0.5s infinite linear;
  transform-origin: top center;
  transform-box: fill-box;
}
.clawd-debugger-shadow-sneak {
  transform-origin: 7.5px 15.5px;
  animation: clawd-debugger-shadow-shift 2s infinite alternate ease-in-out;
}
@keyframes clawd-debugger-hunch-walk {
  0% { transform: translate(-2px, 1px) rotate(2deg); }
  100% { transform: translate(3px, 1px) rotate(2deg); }
}
@keyframes clawd-debugger-shadow-shift {
  0% { transform: translateX(-2px) scale(0.9); opacity: 0.4; }
  100% { transform: translateX(3px) scale(0.9); opacity: 0.4; }
}
@keyframes clawd-debugger-search-glass {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(-3deg) scale(1.05); }
}
@keyframes clawd-debugger-sneak-1 {
  0%, 100% { transform: rotate(0deg) scaleY(1); }
  50% { transform: rotate(-25deg) scaleY(0.7); }
}
@keyframes clawd-debugger-sneak-2 {
  0%, 100% { transform: rotate(-25deg) scaleY(0.7); }
  50% { transform: rotate(0deg) scaleY(1); }
}
`

const ClawdWorkingDebuggerInner = ({
  size = 20,
  'aria-hidden': ariaHidden,
}: ClawdVariantProps) => {
  const decorative = ariaHidden === true || ariaHidden === 'true'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-3 1 22 22"
      overflow="visible"
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : 'Claude Code'}
      aria-hidden={ariaHidden}
      data-slot="clawd-mascot-animated"
      data-variant="debugger"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect className="clawd-debugger-shadow-sneak" x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />

      <g className="clawd-debugger-body-hunch">
        <g fill="#DE886D">
          <rect className="clawd-debugger-leg-1" x="3" y="13" width="1" height="2" />
          <rect className="clawd-debugger-leg-2" x="5" y="13" width="1" height="2" />
          <rect className="clawd-debugger-leg-1" x="9" y="13" width="1" height="2" />
          <rect className="clawd-debugger-leg-2" x="11" y="13" width="1" height="2" />
        </g>

        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" transform="translate(1, -1) rotate(15 1 10)" />
        </g>

        <g fill="#000000">
          <rect x="4" y="8.5" width="1" height="1" />
        </g>

        <g className="clawd-debugger-magnifying-glass">
          <rect x="13" y="9" width="2" height="2" fill="#DE886D" />

          <g transform="translate(13.5, 9.5)">
            <polygon points="0.5,1.5 1.5,0.5 -1,-2 -2,-1" fill="#795548" />
            <rect x="-6" y="-5" width="6" height="6" fill="#546E7A" rx="2" />
            <rect x="-4" y="-3.5" width="2" height="3" fill="#000000" />
            <rect x="-5.5" y="-4.5" width="5" height="5" fill="#E0F7FA" rx="1.5" opacity="0.6" />
            <rect x="-4.5" y="-3.5" width="1.5" height="1.5" fill="#FFFFFF" opacity="0.8" />
          </g>
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingDebugger = memo(ClawdWorkingDebuggerInner)
