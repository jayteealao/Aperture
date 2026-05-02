import { memo } from 'react'

import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-conducting-body-bob {
  transform-origin: 7.5px 15px;
  animation: clawd-conducting-bob 2s infinite ease-in-out;
}
.clawd-conducting-shadow-bob {
  transform-origin: 7.5px 15.5px;
  animation: clawd-conducting-shadow-soft 2s infinite ease-in-out;
}
.clawd-conducting-arm-l-conduct {
  transform-origin: 1px 10px;
  animation: clawd-conducting-conduct-l 2s infinite ease-in-out;
}
.clawd-conducting-arm-r-conduct {
  transform-origin: 14px 10px;
  animation: clawd-conducting-conduct-r 2s infinite ease-in-out;
}
.clawd-conducting-pixel-stream {
  opacity: 0;
  animation: clawd-conducting-stream-flow 2s infinite linear;
}
.clawd-conducting-p1 { animation-delay: 0s; color: #0082FC; }
.clawd-conducting-p2 { animation-delay: 0.4s; color: #FFC107; }
.clawd-conducting-p3 { animation-delay: 0.8s; color: #FF5252; }
.clawd-conducting-p4 { animation-delay: 1.2s; color: #4CAF50; }
.clawd-conducting-p5 { animation-delay: 1.6s; color: #9C27B0; }
@keyframes clawd-conducting-bob {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  50% { transform: translateY(1.5px) scale(1.02, 0.98); }
}
@keyframes clawd-conducting-shadow-soft {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.05); opacity: 0.5; }
}
@keyframes clawd-conducting-conduct-l {
  0%, 100% { transform: rotate(15deg); }
  50% { transform: rotate(85deg); }
}
@keyframes clawd-conducting-conduct-r {
  0%, 100% { transform: rotate(-85deg); }
  50% { transform: rotate(-15deg); }
}
@keyframes clawd-conducting-stream-flow {
  0% { transform: translate(-2px, 6px) scale(0); opacity: 0; }
  15% { transform: translate(0px, 1px) scale(1); opacity: 1; }
  50% { transform: translate(7.5px, -3px) scale(1.5); opacity: 1; }
  85% { transform: translate(15px, 1px) scale(1); opacity: 1; }
  100% { transform: translate(17px, 6px) scale(0); opacity: 0; }
}
`

const ClawdWorkingConductingInner = ({
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
      data-variant="conducting"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-conducting-data-pixel">
          <rect x="0" y="0" width="1.5" height="1.5" fill="currentColor" />
        </g>
      </defs>

      <rect className="clawd-conducting-shadow-bob" x="3" y="15" width="9" height="1" fill="#000000" />

      <g>
        <use href="#clawd-conducting-data-pixel" className="clawd-conducting-pixel-stream clawd-conducting-p1" />
        <use href="#clawd-conducting-data-pixel" className="clawd-conducting-pixel-stream clawd-conducting-p2" />
        <use href="#clawd-conducting-data-pixel" className="clawd-conducting-pixel-stream clawd-conducting-p3" />
        <use href="#clawd-conducting-data-pixel" className="clawd-conducting-pixel-stream clawd-conducting-p4" />
        <use href="#clawd-conducting-data-pixel" className="clawd-conducting-pixel-stream clawd-conducting-p5" />
      </g>

      <g className="clawd-conducting-body-bob">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />

          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-conducting-arm-l-conduct">
            <rect x="0" y="9" width="2" height="2" />
          </g>
          <g className="clawd-conducting-arm-r-conduct">
            <rect x="13" y="9" width="2" height="2" />
          </g>
        </g>

        <g fill="#000000">
          <rect x="3.5" y="8.5" width="2" height="0.5" />
          <rect x="9.5" y="8.5" width="2" height="0.5" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingConducting = memo(ClawdWorkingConductingInner)
