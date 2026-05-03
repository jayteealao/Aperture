import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-overheated-body-exhausted {
  transform-origin: 7.5px 15px;
  animation: clawd-overheated-heavy-breathe 2.5s infinite ease-in-out;
}
.clawd-overheated-arm-fan {
  transform-origin: 14px 10px;
  animation: clawd-overheated-fan-self 0.4s infinite alternate ease-in-out;
}
.clawd-overheated-smoke {
  opacity: 0;
  animation: clawd-overheated-puff-smoke 3s infinite ease-out;
}
.clawd-overheated-sm1 { animation-delay: 0s; }
.clawd-overheated-sm2 { animation-delay: 1s; }
.clawd-overheated-sm3 { animation-delay: 2s; }
@keyframes clawd-overheated-heavy-breathe {
  0%, 100% { transform: scale(1, 1) translateY(0); }
  50% { transform: scale(1.05, 0.9) translateY(1.5px); }
}
@keyframes clawd-overheated-fan-self {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-60deg); }
}
@keyframes clawd-overheated-puff-smoke {
  0% { transform: translate(7.5px, 6px) scale(0.5); opacity: 0; }
  20% { opacity: 0.6; }
  100% { transform: translate(7.5px, -15px) scale(2); opacity: 0; }
}
`

const ClawdWorkingOverheatedInner = ({
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
      data-variant="overheated"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-overheated-smoke-puff">
          <rect x="-1" y="-1" width="2" height="2" fill="#B0BEC5" rx="0.5" />
          <rect x="0" y="-2" width="2" height="2" fill="#CFD8DC" rx="0.5" />
        </g>
      </defs>

      <rect x="-1" y="15" width="17" height="1" fill="#000000" opacity="0.5" />

      <g>
        <use href="#clawd-overheated-smoke-puff" className="clawd-overheated-smoke clawd-overheated-sm1" />
        <use href="#clawd-overheated-smoke-puff" className="clawd-overheated-smoke clawd-overheated-sm2" transform="translate(-2, 0)" />
        <use href="#clawd-overheated-smoke-puff" className="clawd-overheated-smoke clawd-overheated-sm3" transform="translate(2, 0)" />
      </g>

      <g className="clawd-overheated-body-exhausted">
        <g fill="#DE886D">
          <rect x="3" y="9" width="1" height="1" />
          <rect x="5" y="9" width="1" height="1" />
          <rect x="9" y="9" width="1" height="1" />
          <rect x="11" y="9" width="1" height="1" />
        </g>

        <g fill="#DE886D">
          <rect x="1" y="10" width="13" height="5" />
          <rect x="-1" y="13" width="2" height="2" />
        </g>

        <g className="clawd-overheated-arm-fan">
          <rect x="14" y="11" width="2" height="2" fill="#DE886D" />
        </g>

        <g fill="#000000">
          <rect x="3.5" y="12.5" width="2" height="0.4" />
          <rect x="9.5" y="12.5" width="2" height="0.4" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingOverheated = memo(ClawdWorkingOverheatedInner)
