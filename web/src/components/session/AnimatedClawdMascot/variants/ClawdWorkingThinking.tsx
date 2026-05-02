import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-thinking-body-sway {
  transform-origin: 7.5px 15px;
  animation: clawd-thinking-sway 4s infinite ease-in-out;
}
.clawd-thinking-shadow-sway {
  transform-origin: 7.5px 15.5px;
  animation: clawd-thinking-shadow-shift 4s infinite ease-in-out;
}
.clawd-thinking-arm-tap {
  transform-origin: 14px 10px;
  animation: clawd-thinking-tap-chin 0.8s infinite alternate ease-in-out;
}
.clawd-thinking-eyes-think {
  transform-origin: 7.5px 7px;
  animation: clawd-thinking-blink-think 4s infinite;
}
.clawd-thinking-dot { opacity: 0; }
.clawd-thinking-d1 { animation: clawd-thinking-load-dot-1 2s infinite; }
.clawd-thinking-d2 { animation: clawd-thinking-load-dot-2 2s infinite; }
.clawd-thinking-d3 { animation: clawd-thinking-load-dot-3 2s infinite; }
@keyframes clawd-thinking-sway {
  0%, 100% { transform: rotate(0deg) translate(0, 0); }
  25% { transform: rotate(-3deg) translate(-1px, 0); }
  75% { transform: rotate(3deg) translate(1px, 0); }
}
@keyframes clawd-thinking-shadow-shift {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-1px, 0); }
  75% { transform: translate(1px, 0); }
}
@keyframes clawd-thinking-tap-chin {
  0% { transform: rotate(-125deg); }
  100% { transform: rotate(-145deg); }
}
@keyframes clawd-thinking-blink-think {
  0%, 46%, 54%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.1); }
}
@keyframes clawd-thinking-load-dot-1 {
  0%, 20% { opacity: 0; }
  21%, 100% { opacity: 1; }
}
@keyframes clawd-thinking-load-dot-2 {
  0%, 40% { opacity: 0; }
  41%, 100% { opacity: 1; }
}
@keyframes clawd-thinking-load-dot-3 {
  0%, 60% { opacity: 0; }
  61%, 100% { opacity: 1; }
}
`

const ClawdWorkingThinkingInner = ({
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
      data-variant="thinking"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>
      <rect className="clawd-thinking-shadow-sway" x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />
      <g transform="translate(6, -7)">
        <g>
          <g fill="#FFFFFF" opacity="0.9">
            <rect x="2" y="1" width="8" height="7" />
            <rect x="1" y="2" width="10" height="5" />
            <rect x="3" y="0" width="6" height="9" />
            <rect x="2" y="7" width="2" height="2" />
            <rect x="1" y="9" width="1" height="1" />
          </g>
          <g fill="#0082FC">
            <rect className="clawd-thinking-dot clawd-thinking-d1" x="2.5" y="4" width="1" height="1" />
            <rect className="clawd-thinking-dot clawd-thinking-d2" x="5.5" y="4" width="1" height="1" />
            <rect className="clawd-thinking-dot clawd-thinking-d3" x="8.5" y="4" width="1" height="1" />
          </g>
        </g>
      </g>
      <g className="clawd-thinking-body-sway">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" transform="rotate(25 1 10)" />
          <g className="clawd-thinking-arm-tap">
            <rect x="13" y="9" width="2" height="2" />
          </g>
        </g>
        <g className="clawd-thinking-eyes-think" fill="#000000">
          <rect x="5" y="7" width="1" height="2" />
          <rect x="11" y="7" width="1" height="2" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingThinking = memo(ClawdWorkingThinkingInner)
