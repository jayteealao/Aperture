import { memo } from 'react'

import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-juggling-body-rock {
  transform-origin: 7.5px 15px;
  animation: clawd-juggling-rock 0.6s infinite alternate ease-in-out;
}
.clawd-juggling-arm-juggle-l {
  transform-origin: 1px 10px;
  animation: clawd-juggling-arm-jl 0.6s infinite alternate ease-in-out;
}
.clawd-juggling-arm-juggle-r {
  transform-origin: 14px 10px;
  animation: clawd-juggling-arm-jr 0.6s infinite alternate ease-in-out;
}
.clawd-juggling-eyes-dart {
  animation: clawd-juggling-dart 1.2s infinite;
}
.clawd-juggling-packet {
  animation: clawd-juggling-juggle 1.2s infinite linear;
}
.clawd-juggling-p1 { animation-delay: 0s; fill: #FF5252; }
.clawd-juggling-p2 { animation-delay: -0.4s; fill: #FFC107; }
.clawd-juggling-p3 { animation-delay: -0.8s; fill: #4CAF50; }
@keyframes clawd-juggling-rock {
  0% { transform: rotate(-5deg); }
  100% { transform: rotate(5deg); }
}
@keyframes clawd-juggling-arm-jl {
  0% { transform: rotate(60deg); }
  100% { transform: rotate(10deg); }
}
@keyframes clawd-juggling-arm-jr {
  0% { transform: rotate(-10deg); }
  100% { transform: rotate(-60deg); }
}
@keyframes clawd-juggling-dart {
  0%, 100% { transform: translate(-2px, -2px); }
  25% { transform: translate(0, -3px); }
  50% { transform: translate(2px, -2px); }
  75% { transform: translate(0, 0); }
}
@keyframes clawd-juggling-juggle {
  0% { transform: translate(0px, 9px) rotate(0deg); }
  25% { transform: translate(8px, 0px) rotate(90deg); }
  50% { transform: translate(15px, 9px) rotate(180deg); }
  75% { transform: translate(8px, 4px) rotate(270deg); }
  100% { transform: translate(0px, 9px) rotate(360deg); }
}
`

const ClawdWorkingJugglingInner = ({
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
      data-variant="juggling"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />

      <g>
        <rect className="clawd-juggling-packet clawd-juggling-p1" x="-1" y="-1" width="2" height="2" />
        <rect className="clawd-juggling-packet clawd-juggling-p2" x="-1" y="-1" width="2" height="2" />
        <rect className="clawd-juggling-packet clawd-juggling-p3" x="-1" y="-1" width="2" height="2" />
      </g>

      <g className="clawd-juggling-body-rock">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
        </g>

        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-juggling-arm-juggle-l"><rect x="0" y="9" width="2" height="2" /></g>
          <g className="clawd-juggling-arm-juggle-r"><rect x="13" y="9" width="2" height="2" /></g>
        </g>

        <g className="clawd-juggling-eyes-dart" fill="#000000">
          <rect x="4" y="8" width="1" height="2" />
          <rect x="10" y="8" width="1" height="2" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingJuggling = memo(ClawdWorkingJugglingInner)
