import { memo } from 'react'
import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-notification-body-anim {
  transform-origin: 7.5px 15px;
  animation: clawd-notification-attention-jump 4s infinite ease-in-out;
}
.clawd-notification-shadow-anim {
  transform-origin: 7.5px 15.5px;
  animation: clawd-notification-shadow-pulse 4s infinite ease-in-out;
}
.clawd-notification-eyes-look {
  transform-origin: 7.5px 9px;
  animation: clawd-notification-eye-track 4s infinite ease-in-out;
}
.clawd-notification-arm-l {
  transform-origin: 1px 10px;
  animation: clawd-notification-arm-wave-l 4s infinite ease-in-out;
}
.clawd-notification-arm-r {
  transform-origin: 14px 10px;
  animation: clawd-notification-arm-wave-r 4s infinite ease-in-out;
}
.clawd-notification-alert-pop {
  transform-origin: 15px 0px;
  animation: clawd-notification-alert-flash 4s infinite ease-in-out;
  opacity: 0;
}
@keyframes clawd-notification-attention-jump {
  0%, 12% { transform: translate(0px, 0px) scale(1, 1); }
  14%, 22% { transform: translate(-1.5px, 0px) scale(1, 1); }
  26% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  30% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  34% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  38% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  42% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  46% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  50% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  54% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  58% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  62% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  66% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  70% { transform: translate(0px, -10px) scale(0.95, 1.05); }
  74% { transform: translate(0px, 2px) scale(1.1, 0.9); }
  80%, 100% { transform: translate(0px, 0px) scale(1, 1); }
}
@keyframes clawd-notification-shadow-pulse {
  0%, 12%, 80%, 100% { transform: scale(1); opacity: 0.5; }
  14%, 22% { transform: translate(-1.5px, 0px) scale(1); opacity: 0.5; }
  26%, 34%, 42%, 50%, 58%, 66%, 74% { transform: scale(1.15); opacity: 0.6; }
  30%, 38%, 46%, 54%, 62%, 70% { transform: scale(0.6); opacity: 0.15; }
}
@keyframes clawd-notification-eye-track {
  0%, 12% { transform: translate(0px, 0px); }
  14%, 22% { transform: translate(4px, 0px); }
  26%, 100% { transform: translate(0px, 0px); }
}
@keyframes clawd-notification-arm-wave-l {
  0%, 12% { transform: rotate(0deg); }
  14%, 22% { transform: rotate(-15deg); }
  26% { transform: rotate(30deg); }
  30%, 38%, 46%, 54%, 62%, 70% { transform: rotate(155deg); }
  34%, 42%, 50%, 58%, 66%, 74% { transform: rotate(115deg); }
  80%, 100% { transform: rotate(0deg); }
}
@keyframes clawd-notification-arm-wave-r {
  0%, 12% { transform: rotate(0deg); }
  14%, 22% { transform: rotate(-25deg); }
  26% { transform: rotate(-30deg); }
  30%, 38%, 46%, 54%, 62%, 70% { transform: rotate(-155deg); }
  34%, 42%, 50%, 58%, 66%, 74% { transform: rotate(-115deg); }
  80%, 100% { transform: rotate(0deg); }
}
@keyframes clawd-notification-alert-flash {
  0%, 12% { opacity: 0; transform: translate(15px, 0px) scale(0.5); }
  14% { opacity: 1; transform: translate(15px, -4px) scale(1.2); }
  22% { opacity: 1; transform: translate(15px, -4px) scale(1); }
  26%, 100% { opacity: 0; transform: translate(15px, -8px) scale(0.8); }
}
`

const ClawdNotificationInner = ({
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
      data-variant="notification"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
      </defs>
      <rect className="clawd-notification-shadow-anim" x="3" y="15" width="9" height="1" fill="#000000" />
      <g className="clawd-notification-alert-pop" fill="#FF3D00">
        <rect x="0" y="0" width="2" height="4" />
        <rect x="0" y="5" width="2" height="2" />
      </g>
      <g className="clawd-notification-body-anim">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-notification-arm-l">
            <rect x="0" y="9" width="2" height="2" />
          </g>
          <g className="clawd-notification-arm-r">
            <rect x="13" y="9" width="2" height="2" />
          </g>
        </g>
        <g className="clawd-notification-eyes-look" fill="#000000">
          <rect x="4" y="8" width="1" height="2" />
          <rect x="10" y="8" width="1" height="2" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdNotification = memo(ClawdNotificationInner)
