import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-carrying-body-carry {
  transform-origin: 7.5px 15px;
  animation: clawd-carrying-carry-strain 0.15s infinite alternate ease-in-out;
}
.clawd-carrying-data-block {
  animation: clawd-carrying-block-shake 0.15s infinite alternate ease-in-out;
}
.clawd-carrying-leg {
  transform-box: fill-box;
  transform-origin: top center;
}
.clawd-carrying-leg-1 { animation: clawd-carrying-tremble-1 0.1s infinite linear; }
.clawd-carrying-leg-2 { animation: clawd-carrying-tremble-2 0.1s infinite linear; }
.clawd-carrying-sweat {
  opacity: 0;
  animation: clawd-carrying-sweat-fly 2s infinite cubic-bezier(.25,.1,.25,1);
}
.clawd-carrying-shadow-carry {
  transform-origin: 7.5px 15.5px;
  animation: clawd-carrying-shadow-strain 0.15s infinite alternate ease-in-out;
}
@keyframes clawd-carrying-carry-strain {
  0% { transform: translateY(1px) scale(1.05, 0.95); }
  100% { transform: translateY(2px) scale(1.08, 0.92); }
}
@keyframes clawd-carrying-shadow-strain {
  0% { transform: scale(1.1); opacity: 0.6; }
  100% { transform: scale(1.15); opacity: 0.7; }
}
@keyframes clawd-carrying-block-shake {
  0% { transform: translate(0, 0) rotate(-0.5deg); }
  100% { transform: translate(0, 1px) rotate(0.5deg); }
}
@keyframes clawd-carrying-tremble-1 {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-0.5px); }
}
@keyframes clawd-carrying-tremble-2 {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(0.5px); }
}
@keyframes clawd-carrying-sweat-fly {
  0% { transform: translate(0, 0) scale(0); opacity: 0; }
  10% { transform: translate(0, 0) scale(1); opacity: 1; }
  40% { transform: translate(-8px, -4px) scale(0.8); opacity: 0; }
  100% { opacity: 0; }
}
`

const ClawdWorkingCarryingInner = ({
  size = 20,
  'aria-hidden': ariaHidden,
}: ClawdVariantProps) => {
  const decorative = ariaHidden === true || ariaHidden === 'true'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-15 -25 45 45"
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : 'Claude Code'}
      aria-hidden={ariaHidden}
      data-slot="clawd-mascot-animated"
      data-variant="carrying"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect className="clawd-carrying-shadow-carry" x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />

      <g className="clawd-carrying-body-carry">

        <g className="clawd-carrying-data-block" transform="translate(1, -5)">
          <rect x="0" y="0" width="13" height="9" fill="#90A4AE" />
          <rect x="1" y="1" width="11" height="7" fill="#CFD8DC" />
          <rect x="2" y="2" width="2" height="2" fill="#0082FC" />
          <rect x="9" y="2" width="2" height="2" fill="#FFC107" />
          <rect x="3" y="5" width="7" height="2" fill="#B0BEC5" />
        </g>

        <g transform="translate(-1, 5)">
          <g className="clawd-carrying-sweat" fill="#40C4FF">
            <rect x="0" y="1" width="1.5" height="1.5" />
            <rect x="0.25" y="0" width="1" height="1" />
          </g>
        </g>

        <g fill="#DE886D">
          <rect className="clawd-carrying-leg clawd-carrying-leg-1" x="3" y="13" width="1" height="2" />
          <rect className="clawd-carrying-leg clawd-carrying-leg-2" x="5" y="13" width="1" height="2" />
          <rect className="clawd-carrying-leg clawd-carrying-leg-1" x="9" y="13" width="1" height="2" />
          <rect className="clawd-carrying-leg clawd-carrying-leg-2" x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="4" width="2" height="4" />
          <rect x="13" y="4" width="2" height="4" />
        </g>

        <g fill="#000000">
          <rect x="4" y="6.5" width="1" height="1" />
          <rect x="10" y="6" width="1" height="2" />
        </g>

      </g>
    </svg>
  )
}

export const ClawdWorkingCarrying = memo(ClawdWorkingCarryingInner)
