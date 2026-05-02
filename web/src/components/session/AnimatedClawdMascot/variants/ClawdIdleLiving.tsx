import { memo } from 'react'

export interface ClawdVariantProps {
  size?: number
  'aria-hidden'?: boolean | 'true' | 'false'
}

const STYLE = `
.clawd-idle-action-body {
  transform-origin: 7.5px 13px;
  animation: clawd-idle-action-body 16s infinite ease-in-out;
}
.clawd-idle-breathe-anim {
  transform-origin: 7.5px 13px;
  animation: clawd-idle-breathe 3.2s infinite ease-in-out;
}
.clawd-idle-shadow-anim {
  transform-origin: 7.5px 15.5px;
  animation: clawd-idle-shadow-action 16s infinite ease-in-out;
}
.clawd-idle-arm-l {
  transform-origin: 1px 10px;
  animation: clawd-idle-arm-l-idle 16s infinite ease-in-out;
}
.clawd-idle-arm-r {
  transform-origin: 14px 10px;
  animation: clawd-idle-arm-r-idle 16s infinite ease-in-out;
}
.clawd-idle-eyes-look {
  animation: clawd-idle-eye-track 16s infinite ease-in-out;
}
.clawd-idle-eyes-blink {
  transform-origin: 7.5px 9px;
  animation: clawd-idle-eye-blink 16s infinite linear;
}
.clawd-idle-yawn-mouth {
  transform-origin: 7.5px 11px;
  animation: clawd-idle-yawn-mouth-anim 16s infinite ease-in-out;
  opacity: 0;
}
.clawd-idle-yawn-tear {
  animation: clawd-idle-tear-fall 16s infinite ease-in-out;
  opacity: 0;
}
@keyframes clawd-idle-breathe {
  0%, 100% { transform: scale(1, 1) translate(0, 0); }
  50% { transform: scale(1.02, 0.98) translate(0, 0.5px); }
}
@keyframes clawd-idle-action-body {
  0%, 8%, 26%, 38%, 55%, 80%, 100% { transform: scale(1, 1) translate(0, 0); }
  12%, 22% { transform: scale(1, 1) translate(1px, 0); }
  42%, 50% { transform: scale(1, 1) translate(-1px, 0); }
  30%, 36% { transform: scale(1, 1) translate(0.5px, 0); }
  60% { transform: scale(0.95, 1.05) translate(0px, -1px); }
  65% { transform: scale(0.9, 1.1) translate(0px, -2px); }
  72% { transform: scale(1.05, 0.95) translate(0px, 1px); }
  76% { transform: scale(1, 1) translate(0px, 0px); }
}
@keyframes clawd-idle-shadow-action {
  0%, 8%, 26%, 38%, 55%, 80%, 100% { transform: scaleX(1) translate(0, 0); opacity: 0.5; }
  12%, 22% { transform: scaleX(1) translate(1px, 0); opacity: 0.5; }
  42%, 50% { transform: scaleX(1) translate(-1px, 0); opacity: 0.5; }
  30%, 36% { transform: scaleX(1) translate(0.5px, 0); opacity: 0.5; }
  60% { transform: scaleX(0.95) translate(0, 0); opacity: 0.45; }
  65% { transform: scaleX(0.9) translate(0, 0); opacity: 0.4; }
  72% { transform: scaleX(1.05) translate(0, 0); opacity: 0.55; }
  76% { transform: scaleX(1) translate(0, 0); opacity: 0.5; }
}
@keyframes clawd-idle-eye-track {
  0%, 10%, 25%, 38%, 52%, 58%, 80%, 100% { transform: translate(0px, 0px); }
  12%, 22% { transform: translate(3px, 0px); }
  42%, 50% { transform: translate(-3px, 0px); }
  60%, 75% { transform: translate(0px, -1px); }
}
@keyframes clawd-idle-eye-blink {
  0%, 3%, 7%, 18%, 22%, 43%, 47%, 56%, 83%, 87%, 100% { transform: scaleY(1); }
  5%, 20%, 45%, 85% { transform: scaleY(0.1); }
  60% { transform: scaleY(1); }
  62%, 72% { transform: scaleY(0.1); }
  75% { transform: scaleY(1); }
}
@keyframes clawd-idle-arm-l-idle {
  0%, 28% { transform: translate(0, 0) rotate(0deg); }
  30% { transform: translate(1px, -3px) rotate(15deg); }
  31% { transform: translate(1.5px, -4px) rotate(35deg); }
  32% { transform: translate(0.5px, -2.5px) rotate(0deg); }
  33% { transform: translate(1.5px, -4px) rotate(35deg); }
  34% { transform: translate(0.5px, -2.5px) rotate(0deg); }
  35% { transform: translate(1.5px, -4px) rotate(35deg); }
  36% { transform: translate(0.5px, -2.5px) rotate(0deg); }
  38%, 58% { transform: translate(0, 0) rotate(0deg); }
  62% { transform: translate(-1px, -2px) rotate(45deg); }
  65% { transform: translate(-2px, -3px) rotate(80deg); }
  72% { transform: translate(0px, 1px) rotate(-15deg); }
  76%, 100% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes clawd-idle-arm-r-idle {
  0%, 58% { transform: translate(0, 0) rotate(0deg); }
  62% { transform: translate(1px, -2px) rotate(-45deg); }
  65% { transform: translate(2px, -3px) rotate(-80deg); }
  72% { transform: translate(0px, 1px) rotate(15deg); }
  76%, 100% { transform: translate(0, 0) rotate(0deg); }
}
@keyframes clawd-idle-yawn-mouth-anim {
  0%, 58%, 76%, 100% { opacity: 0; transform: scale(0.1); }
  60% { opacity: 1; transform: scale(0.5, 0.2); }
  65% { opacity: 1; transform: scale(1.1, 1.4); }
  72% { opacity: 1; transform: scale(0.6, 0.4); }
  75% { opacity: 0; transform: scale(0.1); }
}
@keyframes clawd-idle-tear-fall {
  0%, 64%, 80%, 100% { opacity: 0; transform: translateY(0); }
  66% { opacity: 1; transform: translateY(0); }
  72% { opacity: 1; transform: translateY(2.5px); }
  75% { opacity: 0; transform: translateY(3px); }
}
`

const ClawdIdleLivingInner = ({
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
      data-variant="idle-living"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>
      <rect className="clawd-idle-shadow-anim" x="3" y="15" width="9" height="1" fill="#000000" opacity="0.5" />
      <g fill="#DE886D">
        <rect x="3" y="13" width="1" height="2" />
        <rect x="5" y="13" width="1" height="2" />
        <rect x="9" y="13" width="1" height="2" />
        <rect x="11" y="13" width="1" height="2" />
      </g>
      <g className="clawd-idle-action-body">
        <g className="clawd-idle-breathe-anim">
          <rect x="2" y="6" width="11" height="7" fill="#DE886D" />
          <g className="clawd-idle-arm-l">
            <rect x="0" y="9" width="2" height="2" fill="#DE886D" />
          </g>
          <g className="clawd-idle-arm-r">
            <rect x="13" y="9" width="2" height="2" fill="#DE886D" />
          </g>
          <rect className="clawd-idle-yawn-mouth" x="6" y="10" width="3" height="2" fill="#000000" />
          <g className="clawd-idle-eyes-look" fill="#000000">
            <g className="clawd-idle-eyes-blink">
              <rect x="4" y="8" width="1" height="2" />
              <rect x="10" y="8" width="1" height="2" />
            </g>
          </g>
          <rect className="clawd-idle-yawn-tear" x="3.5" y="10" width="1" height="1" fill="#40C4FF" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdIdleLiving = memo(ClawdIdleLivingInner)
