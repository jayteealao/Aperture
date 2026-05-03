import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-typing-body-jitter {
  transform-origin: 7.5px 15px;
  animation: clawd-typing-jitter 0.08s infinite alternate ease-in-out;
}
.clawd-typing-arm-l-type {
  transform-origin: 2px 10px;
  animation: clawd-typing-type-l 0.15s infinite ease-in-out;
}
.clawd-typing-arm-r-type {
  transform-origin: 13px 10px;
  animation: clawd-typing-type-r 0.12s infinite ease-in-out;
}
.clawd-typing-eyes-read {
  animation: clawd-typing-read-code 1.2s infinite;
}
.clawd-typing-data-bit {
  opacity: 0;
  animation: clawd-typing-float-data 1s infinite linear;
}
.clawd-typing-d1 { animation-delay: 0.0s; transform-origin: -2px 10px; }
.clawd-typing-d2 { animation-delay: 0.3s; transform-origin: 5px 12px; }
.clawd-typing-d3 { animation-delay: 0.6s; transform-origin: 12px 11px; }
.clawd-typing-d4 { animation-delay: 0.8s; transform-origin: 17px 9px; }
.clawd-typing-d5 { animation-delay: 0.1s; transform-origin: 8px 10px; }
.clawd-typing-d6 { animation-delay: 0.4s; transform-origin: 0px 11px; }
.clawd-typing-d7 { animation-delay: 0.7s; transform-origin: 15px 12px; }
.clawd-typing-logo-glow {
  animation: clawd-typing-logo-pulse 1.5s infinite alternate ease-in-out;
}
@keyframes clawd-typing-jitter {
  0% { transform: translateY(0); }
  100% { transform: translateY(0.5px); }
}
@keyframes clawd-typing-type-l {
  0% { transform: rotate(70deg); }
  25% { transform: rotate(110deg); }
  50% { transform: rotate(80deg); }
  75% { transform: rotate(100deg); }
  100% { transform: rotate(70deg); }
}
@keyframes clawd-typing-type-r {
  0% { transform: rotate(-80deg); }
  25% { transform: rotate(-100deg); }
  50% { transform: rotate(-70deg); }
  75% { transform: rotate(-110deg); }
  100% { transform: rotate(-80deg); }
}
@keyframes clawd-typing-read-code {
  0%, 14% { transform: translate(-2px, 0); }
  15%, 29% { transform: translate(-1px, 0); }
  30%, 44% { transform: translate(0px, 0); }
  45%, 59% { transform: translate(1px, 0); }
  60%, 84% { transform: translate(2px, 0); }
  85%, 100% { transform: translate(-2px, 0); }
}
@keyframes clawd-typing-float-data {
  0% { transform: translateY(0) scale(0.5); opacity: 0; }
  20% { opacity: 0.8; }
  100% { transform: translateY(-15px) scale(1.2); opacity: 0; }
}
@keyframes clawd-typing-logo-pulse {
  0% { opacity: 0.4; }
  100% { opacity: 1; }
}
`

const ClawdWorkingTypingInner = ({
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
      data-variant="typing"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-typing-pixel-packet">
          <rect x="0" y="0" width="1.5" height="1.5" />
        </g>
      </defs>
      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />
      <g fill="#40C4FF">
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d1" x="-2" y="12" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d2" x="5" y="11" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d3" x="12" y="13" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d4" x="17" y="11" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d5" x="8" y="10" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d6" x="1" y="11" />
        <use href="#clawd-typing-pixel-packet" className="clawd-typing-data-bit clawd-typing-d7" x="15" y="12" />
      </g>
      <g className="clawd-typing-body-jitter">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-typing-arm-l-type">
            <rect x="0" y="9" width="2" height="2" />
          </g>
          <g className="clawd-typing-arm-r-type">
            <rect x="13" y="9" width="2" height="2" />
          </g>
        </g>
        <g fill="#000000">
          <g className="clawd-typing-eyes-read">
            <rect x="4" y="8.5" width="1" height="1" />
            <rect x="10" y="8.5" width="1" height="1" />
          </g>
        </g>
      </g>
      <g transform="translate(3, 9.5)">
        <rect x="-0.5" y="5" width="10" height="1" fill="#546E7A" rx="0.5" />
        <rect x="0" y="0" width="9" height="5.5" fill="#78909C" rx="0.5" />
        <circle cx="4.5" cy="2.5" r="1.5" fill="#40C4FF" opacity="0.2" className="clawd-typing-logo-glow" />
        <rect x="4" y="2" width="1" height="1" fill="#FFFFFF" className="clawd-typing-logo-glow" />
      </g>
    </svg>
  )
}

export const ClawdWorkingTyping = memo(ClawdWorkingTypingInner)
