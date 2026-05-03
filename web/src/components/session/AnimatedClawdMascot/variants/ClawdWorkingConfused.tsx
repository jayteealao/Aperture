import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-confused-body-anim {
  transform-origin: 7.5px 15px;
  animation: clawd-confused-body-look 6s infinite ease-in-out;
}
.clawd-confused-eyes-anim {
  animation: clawd-confused-eyes-look 6s infinite ease-in-out;
}
.clawd-confused-eyes-blink {
  transform-origin: 7.5px 9px;
  animation: clawd-confused-blink 6s infinite linear;
}
.clawd-confused-question-mark-l {
  transform-origin: center;
  animation: clawd-confused-question-pop-l 6s infinite ease-in-out;
  opacity: 0;
}
.clawd-confused-question-mark-r {
  transform-origin: center;
  animation: clawd-confused-question-pop-r 6s infinite ease-in-out;
  opacity: 0;
}
@keyframes clawd-confused-body-look {
  0%, 10% { transform: translate(0px, 0px); }
  15%, 35% { transform: translate(-2px, 0px) rotate(-2deg); }
  40%, 45% { transform: translate(0px, 0px); }
  50%, 70% { transform: translate(2px, 0px) rotate(2deg); }
  75%, 100% { transform: translate(0px, 0px); }
}
@keyframes clawd-confused-eyes-look {
  0%, 10% { transform: translate(0px, 0px); }
  15%, 35% { transform: translate(-3px, 0px); }
  40%, 45% { transform: translate(0px, 0px); }
  50%, 70% { transform: translate(3px, 0px); }
  75%, 100% { transform: translate(0px, 0px); }
}
@keyframes clawd-confused-blink {
  0%, 13%, 17%, 48%, 52%, 80%, 84%, 100% { transform: scaleY(1); }
  15%, 50%, 82% { transform: scaleY(0.1); }
}
@keyframes clawd-confused-question-pop-l {
  0%, 15% { opacity: 0; transform: translate(-6px, 6px) scale(0.5); }
  20%, 30% { opacity: 1; transform: translate(-8px, -2px) scale(1); }
  35%, 100% { opacity: 0; transform: translate(-8px, -8px) scale(1.2); }
}
@keyframes clawd-confused-question-pop-r {
  0%, 50% { opacity: 0; transform: translate(6px, 6px) scale(0.5); }
  55%, 65% { opacity: 1; transform: translate(8px, -2px) scale(1); }
  70%, 100% { opacity: 0; transform: translate(8px, -8px) scale(1.2); }
}
`

const ClawdWorkingConfusedInner = ({
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
      data-variant="confused"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-confused-pixel-question">
          <rect x="1" y="0" width="2" height="1" />
          <rect x="0" y="1" width="1" height="1" />
          <rect x="3" y="1" width="1" height="2" />
          <rect x="2" y="3" width="1" height="1" />
          <rect x="1" y="4" width="1" height="1" />
          <rect x="1" y="6" width="1" height="1" />
        </g>
      </defs>

      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />

      <g fill="#DE886D">
        <rect x="3" y="13" width="1" height="2" />
        <rect x="5" y="13" width="1" height="2" />
        <rect x="9" y="13" width="1" height="2" />
        <rect x="11" y="13" width="1" height="2" />
      </g>

      <g className="clawd-confused-body-anim">
        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <rect x="-1" y="7" width="2" height="2" transform="rotate(15 0 8)" />
          <rect x="13" y="9" width="2" height="2" />
        </g>

        <g className="clawd-confused-eyes-anim">
          <g className="clawd-confused-eyes-blink" fill="#000000">
            <rect x="4" y="8" width="1" height="2" />
            <rect x="10" y="8" width="1" height="2" />
          </g>
        </g>
      </g>

      <g className="clawd-confused-question-mark-l" fill="#40C4FF" transform="translate(0, 0)">
        <use href="#clawd-confused-pixel-question" />
      </g>
      <g className="clawd-confused-question-mark-r" fill="#FFC107" transform="translate(10, 0)">
        <use href="#clawd-confused-pixel-question" />
      </g>
    </svg>
  )
}

export const ClawdWorkingConfused = memo(ClawdWorkingConfusedInner)
