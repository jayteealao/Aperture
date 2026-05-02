import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-beacon-body-beacon {
  transform-origin: 7.5px 15px;
  animation: clawd-beacon-beacon-bob 1.5s infinite ease-in-out;
}
.clawd-beacon-wave {
  fill: none;
  stroke-width: 0.6;
  opacity: 0;
}
.clawd-beacon-wave1 { stroke: #0082FC; animation: clawd-beacon-wave-expand 2s 0s infinite; }
.clawd-beacon-wave2 { stroke: #FFC107; animation: clawd-beacon-wave-expand 2s 0.5s infinite; }
.clawd-beacon-wave3 { stroke: #FF5252; animation: clawd-beacon-wave-expand 2s 1s infinite; }
.clawd-beacon-antenna-blink {
  animation: clawd-beacon-ant-blink 0.8s infinite alternate;
}
@keyframes clawd-beacon-beacon-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(0.5px); }
}
@keyframes clawd-beacon-wave-expand {
  0% { r: 3; opacity: 0; stroke-width: 1; }
  10% { opacity: 0.7; }
  100% { r: 18; opacity: 0; stroke-width: 0.2; }
}
@keyframes clawd-beacon-ant-blink {
  0% { fill: #FF5252; opacity: 0.5; }
  100% { fill: #FF5252; opacity: 1; }
}
`

const ClawdWorkingBeaconInner = ({
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
      data-variant="beacon"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>

      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />

      <circle className="clawd-beacon-wave clawd-beacon-wave1" cx="7.5" cy="5" r="3" />
      <circle className="clawd-beacon-wave clawd-beacon-wave2" cx="7.5" cy="5" r="3" />
      <circle className="clawd-beacon-wave clawd-beacon-wave3" cx="7.5" cy="5" r="3" />

      <g className="clawd-beacon-body-beacon">
        <rect x="7" y="2" width="1" height="4" fill="#78909C" />
        <circle className="clawd-beacon-antenna-blink" cx="7.5" cy="1.5" r="1" />

        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <rect x="0" y="9" width="2" height="2" transform="rotate(15 1 10)" />
          <rect x="13" y="9" width="2" height="2" transform="rotate(-15 14 10)" />
        </g>

        <g fill="#000000">
          <rect x="4" y="8" width="1.5" height="1.5" />
          <rect x="9.5" y="8" width="1.5" height="1.5" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingBeacon = memo(ClawdWorkingBeaconInner)
