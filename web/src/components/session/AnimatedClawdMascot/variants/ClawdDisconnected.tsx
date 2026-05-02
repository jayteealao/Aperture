import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-disconnected-body-anim {
  animation: clawd-disconnected-body-move 6s infinite ease-in-out;
}
.clawd-disconnected-eyes-anim {
  animation: clawd-disconnected-eyes-move 6s infinite ease-in-out;
}
.clawd-disconnected-eyes-blink {
  transform-origin: 7.5px 9px;
  animation: clawd-disconnected-blink 6s infinite linear;
}
.clawd-disconnected-question-mark {
  transform-origin: center;
  animation: clawd-disconnected-question-fade 6s infinite ease-in-out;
}
.clawd-disconnected-exclamation-mark {
  transform-origin: center;
  animation: clawd-disconnected-exclamation-fade 6s infinite ease-in-out;
}
.clawd-disconnected-ble-icon-group {
  animation: clawd-disconnected-ble-float 3s infinite ease-in-out;
}
.clawd-disconnected-ble-shadow {
  transform-origin: 26px 15.5px;
  animation: clawd-disconnected-ble-shadow-pulse 3s infinite ease-in-out;
}
.clawd-disconnected-glow-pulse {
  transform-origin: 0px 0px;
  animation: clawd-disconnected-glow 3s infinite ease-in-out;
}
@keyframes clawd-disconnected-body-move {
  0%, 5% { transform: translate(0px, 0px); }
  12%, 22% { transform: translate(-1px, 0px); }
  29%, 39% { transform: translate(1px, 0px); }
  44% { transform: translate(-1px, 0px); }
  49% { transform: translate(1px, 0px); }
  56%, 88% { transform: translate(1px, -1px); }
  95%, 100% { transform: translate(0px, 0px); }
}
@keyframes clawd-disconnected-eyes-move {
  0%, 5% { transform: translate(0px, 0px); }
  12%, 22% { transform: translate(-2px, 0px); }
  29%, 39% { transform: translate(2px, 0px); }
  44% { transform: translate(-2px, 0px); }
  49% { transform: translate(2px, 0px); }
  56%, 88% { transform: translate(3px, -2px); }
  95%, 100% { transform: translate(0px, 0px); }
}
@keyframes clawd-disconnected-blink {
  0%, 20%, 24%, 60%, 64%, 80%, 84%, 100% { transform: scaleY(1); }
  22%, 62%, 82% { transform: scaleY(0.1); }
}
@keyframes clawd-disconnected-question-fade {
  0%, 5% { opacity: 0; transform: translate(-4px, 4px) scale(0.5); }
  12%, 46% { opacity: 1; transform: translate(-4px, 0px) scale(1); }
  50%, 100% { opacity: 0; transform: translate(-4px, -4px) scale(1.2); }
}
@keyframes clawd-disconnected-exclamation-fade {
  0%, 50% { opacity: 0; transform: translate(6px, 0px) scale(0.5); }
  56%, 85% { opacity: 1; transform: translate(6px, -4px) scale(1); }
  90%, 100% { opacity: 0; transform: translate(6px, -8px) scale(1.2); }
}
@keyframes clawd-disconnected-ble-float {
  0%, 100% { transform: translate(26px, -3px); }
  50% { transform: translate(26px, -6px); }
}
@keyframes clawd-disconnected-ble-shadow-pulse {
  0%, 100% { transform: scale(1); opacity: 0.3; }
  50% { transform: scale(0.8); opacity: 0.15; }
}
@keyframes clawd-disconnected-glow {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50% { transform: scale(1.3); opacity: 0.1; }
}
`

const ClawdDisconnectedInner = ({
  size = 20,
  'aria-hidden': ariaHidden,
}: ClawdVariantProps) => {
  const decorative = ariaHidden === true || ariaHidden === 'true'
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-10 -20 50 40"
      role={decorative ? 'presentation' : 'img'}
      aria-label={decorative ? undefined : 'Claude Code'}
      aria-hidden={ariaHidden}
      data-slot="clawd-mascot-animated"
      data-variant="disconnected"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>
      <ellipse className="clawd-disconnected-ble-shadow" cx="26" cy="15.5" rx="5" ry="0.8" fill="#000000" opacity="0.3" />
      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />
      <g fill="#DE886D">
        <rect x="3" y="13" width="1" height="2" />
        <rect x="5" y="13" width="1" height="2" />
        <rect x="9" y="13" width="1" height="2" />
        <rect x="11" y="13" width="1" height="2" />
      </g>
      <g className="clawd-disconnected-body-anim">
        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" />
          <rect x="13" y="9" width="2" height="2" />
        </g>
        <g className="clawd-disconnected-eyes-anim">
          <g className="clawd-disconnected-eyes-blink" fill="#000000">
            <rect x="4" y="8" width="1" height="2" />
            <rect x="10" y="8" width="1" height="2" />
          </g>
        </g>
      </g>
      <g className="clawd-disconnected-question-mark" fill="#FFFFFF" opacity="0">
        <rect x="1" y="0" width="2" height="1" />
        <rect x="0" y="1" width="1" height="1" />
        <rect x="3" y="1" width="1" height="2" />
        <rect x="2" y="3" width="1" height="1" />
        <rect x="1" y="4" width="1" height="1" />
        <rect x="1" y="6" width="1" height="1" />
      </g>
      <g className="clawd-disconnected-exclamation-mark" fill="#0082FC" opacity="0">
        <rect x="1" y="0" width="1" height="4" />
        <rect x="1" y="5" width="1" height="1" />
      </g>
      <g className="clawd-disconnected-ble-icon-group">
        <circle cx="0" cy="0" r="9" fill="#0082FC" className="clawd-disconnected-glow-pulse" opacity="0.4" />
        <circle cx="0" cy="0" r="6" fill="#0082FC" />
        <path d="M -3,3 L 3,-3 L 0,-6 L 0,6 L 3,3 L -3,-3" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export const ClawdDisconnected = memo(ClawdDisconnectedInner)
