import { memo } from 'react'

import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-sweeping-body-sweep {
  transform-origin: 7.5px 15px;
  animation: clawd-sweeping-sweep-lean 1.5s infinite ease-in-out;
}
.clawd-sweeping-arm-sweep {
  transform-origin: 14px 10px;
  animation: clawd-sweeping-sweep-arm 1.5s infinite ease-in-out;
}
.clawd-sweeping-broom {
  transform-origin: 13.5px 14px;
  animation: clawd-sweeping-sweep-broom 1.5s infinite ease-in-out;
}
.clawd-sweeping-dust {
  opacity: 0;
  animation: clawd-sweeping-sweep-dust 1.5s infinite ease-out;
}
.clawd-sweeping-d1 { animation-delay: 0.2s; }
.clawd-sweeping-d2 { animation-delay: 0.4s; }
@keyframes clawd-sweeping-sweep-lean {
  0%, 100% { transform: rotate(5deg) translate(1px, 0); }
  50% { transform: rotate(15deg) translate(3px, 1px); }
}
@keyframes clawd-sweeping-sweep-arm {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-20deg); }
}
@keyframes clawd-sweeping-sweep-broom {
  0%, 100% { transform: rotate(10deg); }
  50% { transform: rotate(30deg) translate(2px, -1px); }
}
@keyframes clawd-sweeping-sweep-dust {
  0%, 40% { transform: translate(17px, 14px) scale(0); opacity: 0; }
  50% { transform: translate(19px, 14px) scale(1); opacity: 1; }
  100% { transform: translate(25px, 14px) scale(0.5); opacity: 0; }
}
`

const ClawdWorkingSweepingInner = ({
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
      data-variant="sweeping"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect x="3" y="15" width="13" height="1" fill="#000000" opacity="0.5" />

      <g className="clawd-sweeping-body-sweep">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
        </g>

        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" transform="translate(6, 1) rotate(-15 1 10)" />
          <g className="clawd-sweeping-arm-sweep"><rect x="13" y="9" width="2" height="2" /></g>
        </g>

        <g fill="#000000">
          <rect x="5" y="8.5" width="1" height="1" />
          <rect x="11" y="8" width="1" height="2" />
        </g>
      </g>

      <g className="clawd-sweeping-broom">
        <rect x="13.5" y="4" width="1" height="10" fill="#795548" />
        <rect x="12" y="14" width="4" height="2" fill="#FFC107" />
      </g>

      <g className="clawd-sweeping-dust" fill="#9E9E9E">
        <rect x="0" y="0" width="1.5" height="1.5" />
      </g>
      <g className="clawd-sweeping-dust clawd-sweeping-d1" fill="#B0BEC5">
        <rect x="0" y="0" width="1" height="1" />
      </g>
    </svg>
  )
}

export const ClawdWorkingSweeping = memo(ClawdWorkingSweepingInner)
