import { memo } from 'react'

import type { ClawdVariantProps } from './ClawdIdleLiving'

const STYLE = `
.clawd-wizard-body-magic {
  transform-origin: 7.5px 15px;
  animation: clawd-wizard-float-body 3s infinite ease-in-out;
}
.clawd-wizard-arm-wand {
  transform-origin: 14px 10px;
  animation: clawd-wizard-wave-wand 3s infinite ease-in-out;
}
.clawd-wizard-arm-l-magic {
  transform-origin: 1px 10px;
  animation: clawd-wizard-wave-magic 3s infinite ease-in-out;
}
.clawd-wizard-eyes-magic {
  animation: clawd-wizard-blink-magic 3s infinite;
}
.clawd-wizard-magic-star {
  opacity: 0;
  animation: clawd-wizard-sparkle-magic 2s infinite ease-out;
}
.clawd-wizard-s1 { animation-delay: 0s; fill: #FFD700; }
.clawd-wizard-s2 { animation-delay: 0.5s; fill: #40C4FF; }
.clawd-wizard-s3 { animation-delay: 1s; fill: #B388FF; }
.clawd-wizard-s4 { animation-delay: 1.5s; fill: #FF8A80; }
@keyframes clawd-wizard-float-body {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes clawd-wizard-wave-wand {
  0%, 100% { transform: rotate(-20deg); }
  50% { transform: rotate(-120deg); }
}
@keyframes clawd-wizard-wave-magic {
  0%, 100% { transform: rotate(20deg); }
  50% { transform: rotate(120deg); }
}
@keyframes clawd-wizard-blink-magic {
  0%, 40% { transform: scaleY(0.1); }
  45%, 95% { transform: scaleY(1); }
  100% { transform: scaleY(0.1); }
}
@keyframes clawd-wizard-sparkle-magic {
  0% { transform: translate(14px, 4px) scale(0) rotate(0deg); opacity: 0; }
  20% { opacity: 1; }
  100% { transform: translate(14px, -15px) scale(1.5) rotate(180deg); opacity: 0; }
}
`

const ClawdWorkingWizardInner = ({
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
      data-variant="wizard"
      shapeRendering="crispEdges"
      style={{ width: size, height: size }}
    >
      <defs>
        <style>{STYLE}</style>
        <g id="clawd-wizard-star">
          <polygon points="0,-2 0.5,-0.5 2,0 0.5,0.5 0,2 -0.5,0.5 -2,0 -0.5,-0.5" />
        </g>
      </defs>

      <rect x="3" y="15" width="9" height="1" fill="#000000" opacity="0.4" />

      <g>
        <use href="#clawd-wizard-star" className="clawd-wizard-magic-star clawd-wizard-s1" />
        <use href="#clawd-wizard-star" className="clawd-wizard-magic-star clawd-wizard-s2" transform="translate(-10, 0)" />
        <use href="#clawd-wizard-star" className="clawd-wizard-magic-star clawd-wizard-s3" transform="translate(5, -5)" />
        <use href="#clawd-wizard-star" className="clawd-wizard-magic-star clawd-wizard-s4" transform="translate(-5, -10)" />
      </g>

      <g className="clawd-wizard-body-magic">
        <g fill="#DE886D">
          <rect x="3" y="13" width="1" height="2" />
          <rect x="5" y="13" width="1" height="2" />
          <rect x="9" y="13" width="1" height="2" />
          <rect x="11" y="13" width="1" height="2" />
        </g>

        <g fill="#DE886D">
          <rect x="2" y="6" width="11" height="7" />
          <g className="clawd-wizard-arm-l-magic"><rect x="0" y="9" width="2" height="2" /></g>
          <g className="clawd-wizard-arm-wand">
            <rect x="13" y="9" width="2" height="2" />
            <rect x="13.5" y="4" width="1" height="6" fill="#8D6E63" />
            <rect x="13.5" y="4" width="1" height="1" fill="#FFD700" />
          </g>
        </g>

        <g fill="#000000" className="clawd-wizard-eyes-magic" transform-origin="7.5px 9px">
          <rect x="4" y="8" width="1" height="2" />
          <rect x="10" y="8" width="1" height="2" />
        </g>

        <g transform="translate(7.5, 6)">
          <polygon points="-4,0 4,0 0,-6" fill="#673AB7" />
          <rect x="-5" y="0" width="10" height="1" fill="#512DA8" />
          <polygon points="0,-3 0.5,-2.5 1.5,-2.5 0.75,-1.75 1,-0.5 0,-1.25 -1,-0.5 -0.75,-1.75 -1.5,-2.5 -0.5,-2.5" fill="#FFC107" />
        </g>
      </g>
    </svg>
  )
}

export const ClawdWorkingWizard = memo(ClawdWorkingWizardInner)
