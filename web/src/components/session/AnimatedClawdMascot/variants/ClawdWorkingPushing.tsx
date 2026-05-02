import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-pushing-body-push {
  transform-origin: 7.5px 15px;
  animation: clawd-pushing-push-strain 0.6s infinite alternate ease-in-out;
}
.clawd-pushing-data-block {
  animation: clawd-pushing-block-shake 0.1s infinite alternate;
}
.clawd-pushing-leg {
  transform-box: fill-box;
  transform-origin: top center;
}
.clawd-pushing-leg-1 { animation: clawd-pushing-run-1 0.3s infinite linear; }
.clawd-pushing-leg-2 { animation: clawd-pushing-run-2 0.3s infinite linear; }
.clawd-pushing-sweat {
  opacity: 0;
  animation: clawd-pushing-sweat-fly 2s infinite cubic-bezier(.25,.1,.25,1);
}
.clawd-pushing-shadow-push {
  transform-origin: 7.5px 15.5px;
  animation: clawd-pushing-shadow-strain 0.6s infinite alternate ease-in-out;
}
@keyframes clawd-pushing-push-strain {
  0% { transform: rotate(12deg) scale(1, 0.95); }
  100% { transform: rotate(18deg) scale(1.05, 0.9); }
}
@keyframes clawd-pushing-shadow-strain {
  0% { transform: translateX(1px) scaleX(1); opacity: 0.5; }
  100% { transform: translateX(3px) scaleX(1.1); opacity: 0.6; }
}
@keyframes clawd-pushing-block-shake {
  0% { transform: translate(0, 0); }
  100% { transform: translate(0.5px, -0.5px); }
}
@keyframes clawd-pushing-run-1 {
  0%, 100% { transform: rotate(0deg) scaleY(1); }
  50% { transform: rotate(-25deg) scaleY(0.7); }
}
@keyframes clawd-pushing-run-2 {
  0%, 100% { transform: rotate(-25deg) scaleY(0.7); }
  50% { transform: rotate(0deg) scaleY(1); }
}
@keyframes clawd-pushing-sweat-fly {
  0% { transform: translate(0, 0) scale(0); opacity: 0; }
  10% { transform: translate(0, 0) scale(1); opacity: 1; }
  40% { transform: translate(-8px, -4px) scale(0.8); opacity: 0; }
  100% { opacity: 0; }
}
`

const ClawdWorkingPushingInner = ({
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
      data-variant="pushing"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect className="clawd-pushing-shadow-push" x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />
      <rect x="14" y="15" width="10" height="1" fill="#000000" opacity="0.4" />

      <g className="clawd-pushing-data-block" transform="translate(14, 5)">
        <rect x="0" y="0" width="10" height="10" fill="#90A4AE" />
        <rect x="1" y="1" width="8" height="8" fill="#CFD8DC" />
        <rect x="2" y="2" width="2" height="2" fill="#0082FC" />
        <rect x="6" y="2" width="2" height="2" fill="#FFC107" />
        <rect x="2" y="6" width="6" height="2" fill="#B0BEC5" />
      </g>

      <g className="clawd-pushing-body-push">

        <g transform="translate(1, 4)">
          <g className="clawd-pushing-sweat" fill="#40C4FF">
            <rect x="0" y="1" width="1.5" height="1.5" />
            <rect x="0.25" y="0" width="1" height="1" />
          </g>
        </g>

        <g fill="#DE886D">
          <rect className="clawd-pushing-leg clawd-pushing-leg-1" x="3" y="13" width="1" height="2" />
          <rect className="clawd-pushing-leg clawd-pushing-leg-2" x="5" y="13" width="1" height="2" />
          <rect className="clawd-pushing-leg clawd-pushing-leg-1" x="9" y="13" width="1" height="2" />
          <rect className="clawd-pushing-leg clawd-pushing-leg-2" x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" transform="translate(11, 0) rotate(-15 1 10)" />
          <rect x="13" y="9" width="2" height="2" transform="translate(0, -1) rotate(-15 14 10)" />
        </g>

        <g fill="#000000">
          <rect x="8" y="8.5" width="1" height="1" />
          <rect x="12" y="7" width="1" height="2.5" />
        </g>

      </g>
    </svg>
  )
}

export const ClawdWorkingPushing = memo(ClawdWorkingPushingInner)
