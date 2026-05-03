import { memo, useEffect, useRef, useState } from 'react'
import type { SessionVisualState } from '@/api/types'
import { cn } from '@/utils/cn'

import { ClawdIdleLiving } from './variants/ClawdIdleLiving'
import { ClawdDisconnected } from './variants/ClawdDisconnected'
import { ClawdNotification } from './variants/ClawdNotification'
import { ClawdWorkingTyping } from './variants/ClawdWorkingTyping'
import { ClawdWorkingBuilding } from './variants/ClawdWorkingBuilding'
import { ClawdWorkingThinking } from './variants/ClawdWorkingThinking'
import { ClawdWorkingJuggling } from './variants/ClawdWorkingJuggling'
import { ClawdWorkingConducting } from './variants/ClawdWorkingConducting'
import { ClawdWorkingDebugger } from './variants/ClawdWorkingDebugger'
import { ClawdWorkingSweeping } from './variants/ClawdWorkingSweeping'
import { ClawdWorkingWizard } from './variants/ClawdWorkingWizard'
import { ClawdWorkingOverheated } from './variants/ClawdWorkingOverheated'
import { ClawdWorkingBeacon } from './variants/ClawdWorkingBeacon'
import { ClawdWorkingCarrying } from './variants/ClawdWorkingCarrying'
import { ClawdWorkingConfused } from './variants/ClawdWorkingConfused'
import { ClawdWorkingPushing } from './variants/ClawdWorkingPushing'

const WORKING_VARIANTS = [
  ClawdWorkingTyping,
  ClawdWorkingBuilding,
  ClawdWorkingThinking,
  ClawdWorkingJuggling,
  ClawdWorkingConducting,
  ClawdWorkingDebugger,
  ClawdWorkingSweeping,
  ClawdWorkingWizard,
  ClawdWorkingOverheated,
  ClawdWorkingBeacon,
  ClawdWorkingCarrying,
  ClawdWorkingConfused,
  ClawdWorkingPushing,
] as const

const WORKING_COUNT = WORKING_VARIANTS.length

export type WorkingVariantIndex =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

const ACTIVATION_STATES = new Set<SessionVisualState>(['starting', 'active'])

// Pure deterministic picker. Given the activation counter and the previous
// working-variant index, pick the next index. activationCount === 0 always
// resolves to 0; subsequent activations choose from the 12 candidates that
// differ from `prev`, cycling by counter value.
export function pickWorkingVariant(
  activationCount: number,
  prev: WorkingVariantIndex,
): WorkingVariantIndex {
  if (activationCount === 0) return 0
  const candidates: WorkingVariantIndex[] = []
  for (let i = 0; i < WORKING_COUNT; i += 1) {
    if (i !== prev) candidates.push(i as WorkingVariantIndex)
  }
  return candidates[activationCount % candidates.length] as WorkingVariantIndex
}

export interface AnimatedClawdMascotProps {
  sessionState: SessionVisualState
  size?: number
  'aria-hidden'?: boolean | 'true' | 'false'
  className?: string
}

interface CounterState {
  count: number
  idx: WorkingVariantIndex
}

const INITIAL_COUNTER: CounterState = { count: 0, idx: 0 }

const AnimatedClawdMascotInner = ({
  sessionState,
  size = 20,
  'aria-hidden': ariaHidden,
  className,
}: AnimatedClawdMascotProps) => {
  const [counter, setCounter] = useState<CounterState>(INITIAL_COUNTER)
  const prevStateRef = useRef<SessionVisualState>(sessionState)

  useEffect(() => {
    const prev = prevStateRef.current
    const wasActive = ACTIVATION_STATES.has(prev)
    const isActive = ACTIVATION_STATES.has(sessionState)
    if (isActive && !wasActive) {
      setCounter(({ count, idx }) => {
        const nextCount = count + 1
        return { count: nextCount, idx: pickWorkingVariant(nextCount, idx) }
      })
    }
    prevStateRef.current = sessionState
  }, [sessionState])

  let Variant: typeof ClawdIdleLiving
  let variantKey: string

  switch (sessionState) {
    case 'idle':
      Variant = ClawdIdleLiving
      variantKey = 'idle'
      break
    case 'disconnected':
      Variant = ClawdDisconnected
      variantKey = 'disconnected'
      break
    case 'awaiting':
      Variant = ClawdNotification
      variantKey = 'awaiting'
      break
    case 'starting':
    case 'active':
      Variant = WORKING_VARIANTS[counter.idx]
      // Same idx on starting→active means same key, no remount — preserves
      // the running animation across the same turn. New activation gets a
      // new count, forcing remount + fade-in.
      variantKey = `working-${counter.count}-${counter.idx}`
      break
    default:
      // Defensive fallback for any unrecognized sessionState (test fixtures
      // bypassing the union, future API extensions, malformed payloads).
      // Renders idle so the SDK header degrades gracefully instead of
      // crashing the surrounding region with an invalid-element error.
      Variant = ClawdIdleLiving
      variantKey = 'idle-fallback'
      break
  }

  return (
    <span
      key={variantKey}
      className={cn(
        'inline-flex animate-in fade-in-0 duration-150',
        className,
      )}
      data-session-state={sessionState}
    >
      <Variant size={size} aria-hidden={ariaHidden} />
    </span>
  )
}

export const AnimatedClawdMascot = memo(AnimatedClawdMascotInner)
export default AnimatedClawdMascot
