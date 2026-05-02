import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-building-body-bounce {
  transform-origin: 7.5px 15px;
  animation: clawd-building-hammer-bounce 1s infinite;
}
.clawd-building-shadow-pulse {
  transform-origin: 7.5px 15.5px;
  animation: clawd-building-shadow-impact 1s infinite;
}
.clawd-building-arm-l-rest {
  transform-origin: 2px 10px;
  animation: clawd-building-arm-rest 1s infinite;
}
.clawd-building-arm-hammer {
  transform-origin: 14px 10px;
  animation: clawd-building-hammer-swing 1s infinite;
}
.clawd-building-eyes-blink {
  transform-origin: 7.5px 9px;
  animation: clawd-building-hammer-eyes 1s infinite;
}
.clawd-building-spark {
  opacity: 0;
}
.clawd-building-s1 { animation: clawd-building-spark-1 1s infinite; }
.clawd-building-s2 { animation: clawd-building-spark-2 1s infinite; }
.clawd-building-s3 { animation: clawd-building-spark-3 1s infinite; }
.clawd-building-sweat {
  opacity: 0;
  animation: clawd-building-sweat-fly 1s infinite cubic-bezier(.25,.1,.25,1);
}
.clawd-building-hot-metal {
  animation: clawd-building-metal-glow 1s infinite;
}
@keyframes clawd-building-hammer-bounce {
  0%, 100% { transform: scale(1, 1) translateY(0); }
  30% { transform: scale(0.95, 1.05) translateY(-2px); }
  45% { transform: scale(1, 1) translateY(0); }
  50% { transform: scale(1.15, 0.85) translateY(2px); }
  70% { transform: scale(1, 1) translateY(0); }
}
@keyframes clawd-building-shadow-impact {
  0%, 45%, 70%, 100% { transform: scale(1); opacity: 0.5; }
  30% { transform: scale(0.8); opacity: 0.3; }
  50% { transform: scale(1.3); opacity: 0.8; }
}
@keyframes clawd-building-arm-rest {
  0%, 100% { transform: rotate(0deg); }
  30% { transform: rotate(15deg); }
  50% { transform: rotate(-5deg); }
}
@keyframes clawd-building-hammer-swing {
  0%, 100% { transform: rotate(15deg); }
  30% { transform: rotate(-45deg); }
  45% { transform: rotate(40deg); }
  50% { transform: rotate(125deg); }
  70% { transform: rotate(15deg); }
}
@keyframes clawd-building-hammer-eyes {
  0%, 40% { transform: scaleY(1); }
  48%, 60% { transform: scaleY(0.1); }
  65%, 100% { transform: scaleY(1); }
}
@keyframes clawd-building-metal-glow {
  0%, 49% { fill: #FF5252; }
  50%, 60% { fill: #FFF59D; }
  100% { fill: #FF5252; }
}
@keyframes clawd-building-sweat-fly {
  0% { transform: translate(0, 0) scale(0); opacity: 0; }
  30% { transform: translate(0, 0) scale(1); opacity: 1; }
  80% { transform: translate(-6px, -6px) scale(0.8); opacity: 0; }
  100% { opacity: 0; }
}
@keyframes clawd-building-spark-1 {
  0%, 49% { transform: translate(0, 0) scale(0); opacity: 0; }
  50% { transform: translate(0, 0) scale(1); opacity: 1; }
  70% { transform: translate(4px, -6px) scale(0); opacity: 0; }
  100% { opacity: 0; }
}
@keyframes clawd-building-spark-2 {
  0%, 49% { transform: translate(0, 0) scale(0); opacity: 0; }
  50% { transform: translate(0, 0) scale(1); opacity: 1; }
  70% { transform: translate(7px, -1px) scale(0); opacity: 0; }
  100% { opacity: 0; }
}
@keyframes clawd-building-spark-3 {
  0%, 49% { transform: translate(0, 0) scale(0); opacity: 0; }
  50% { transform: translate(0, 0) scale(1); opacity: 1; }
  70% { transform: translate(3px, 3px) scale(0); opacity: 0; }
  100% { opacity: 0; }
}
`

const ClawdWorkingBuildingInner = ({
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
      data-variant="building"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-building-pixel-spark">
          <rect x="0" y="0" width="1" height="1" />
        </g>
      </defs>
      <rect className="clawd-building-shadow-pulse" x="3" y="15" width="9" height="1" fill="#000000" />
      <rect x="16" y="15" width="7" height="1" fill="#000000" opacity="0.4" />
      <g transform="translate(17, 13)">
        <rect x="0" y="2" width="5" height="1" fill="#546E7A" />
        <rect x="1" y="0" width="3" height="2" fill="#78909C" />
        <rect x="1.5" y="-0.5" width="2" height="1" className="clawd-building-hot-metal" />
      </g>
      <g fill="#FFC107" transform="translate(19, 12.5)">
        <use href="#clawd-building-pixel-spark" className="clawd-building-spark clawd-building-s1" />
        <use href="#clawd-building-pixel-spark" className="clawd-building-spark clawd-building-s2" />
        <use href="#clawd-building-pixel-spark" className="clawd-building-spark clawd-building-s3" />
      </g>
      <g className="clawd-building-body-bounce">
        <g transform="translate(1, 8)">
          <g className="clawd-building-sweat" fill="#40C4FF">
            <rect x="0" y="1" width="1.5" height="1.5" />
            <rect x="0.25" y="0" width="1" height="1" />
          </g>
        </g>
        <g>
          <rect x="4" y="1" width="2" height="1" fill="#FBC02D" />
          <rect x="9" y="1" width="2" height="1" fill="#FBC02D" />
          <rect x="3" y="2" width="1" height="1" fill="#F9A825" />
          <rect x="4" y="2" width="2" height="1" fill="#FBC02D" />
          <rect x="6" y="2" width="1" height="1" fill="#F9A825" />
          <rect x="7" y="2" width="1" height="1" fill="#FBC02D" />
          <rect x="8" y="2" width="1" height="1" fill="#F9A825" />
          <rect x="9" y="2" width="2" height="1" fill="#FBC02D" />
          <rect x="11" y="2" width="1" height="1" fill="#F9A825" />
          <rect x="2" y="3" width="1" height="1" fill="#F9A825" />
          <rect x="3" y="3" width="3" height="1" fill="#FBC02D" />
          <rect x="6" y="3" width="1" height="1" fill="#F9A825" />
          <rect x="7" y="3" width="1" height="1" fill="#FBC02D" />
          <rect x="8" y="3" width="1" height="1" fill="#F9A825" />
          <rect x="9" y="3" width="3" height="1" fill="#FBC02D" />
          <rect x="12" y="3" width="1" height="1" fill="#F9A825" />
          <rect x="1" y="4" width="2" height="1" fill="#F9A825" />
          <rect x="3" y="4" width="9" height="1" fill="#FBC02D" />
          <rect x="12" y="4" width="2" height="1" fill="#F9A825" />
          <rect x="0" y="5" width="15" height="1" fill="#F9A825" />
        </g>
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-building-arm-l-rest">
            <rect x="0" y="9" width="2" height="2" />
          </g>
          <g className="clawd-building-arm-hammer">
            <rect x="13" y="9" width="2" height="2" />
            <rect x="13.5" y="4" width="1" height="6" fill="#795548" />
            <rect x="12.5" y="3" width="3" height="2" fill="#9E9E9E" />
          </g>
        </g>
        <g className="clawd-building-eyes-blink" fill="#000000">
          <rect x="4" y="8.5" width="1.5" height="1.5" />
          <rect x="9.5" y="8.5" width="1.5" height="1.5" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingBuilding = memo(ClawdWorkingBuildingInner)
