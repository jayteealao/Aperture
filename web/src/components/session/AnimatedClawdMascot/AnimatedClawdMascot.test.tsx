// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import {
  AnimatedClawdMascot,
  pickWorkingVariant,
  type WorkingVariantIndex,
} from './index'
import { deriveSessionVisualState } from '../SessionHeaderSlot'
import type { ConnectionState, SessionVisualState } from '@/api/types'

afterEach(cleanup)

const getVariantAttr = (root: HTMLElement | Element | null) => {
  if (!root) return null
  const svg = root.querySelector('svg[data-variant]')
  return svg?.getAttribute('data-variant') ?? null
}

const conn = (status: ConnectionState['status']): ConnectionState => ({
  status,
  error: null,
  retryCount: 0,
  isStreaming: status === 'connected',
  hasUnread: false,
  unreadCount: 0,
  lastActivity: 0,
})

describe('pickWorkingVariant', () => {
  it('returns 0 when activationCount is 0', () => {
    expect(pickWorkingVariant(0, 0)).toBe(0)
    expect(pickWorkingVariant(0, 5)).toBe(0)
    expect(pickWorkingVariant(0, 12)).toBe(0)
  })

  it('returns an index different from prev for any positive count', () => {
    for (let prev = 0; prev < 13; prev += 1) {
      for (let count = 1; count <= 50; count += 1) {
        const next = pickWorkingVariant(count, prev as WorkingVariantIndex)
        expect(next).not.toBe(prev)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(13)
      }
    }
  })

  it('is deterministic — same inputs always produce the same output', () => {
    expect(pickWorkingVariant(7, 3)).toBe(pickWorkingVariant(7, 3))
    expect(pickWorkingVariant(123, 9)).toBe(pickWorkingVariant(123, 9))
  })
})

describe('deriveSessionVisualState', () => {
  it('returns disconnected when connection is not connected', () => {
    expect(deriveSessionVisualState('streaming', 0, conn('disconnected'))).toBe('disconnected')
    expect(deriveSessionVisualState('streaming', 0, conn('reconnecting'))).toBe('disconnected')
    expect(deriveSessionVisualState('streaming', 0, conn('error'))).toBe('disconnected')
  })

  it('returns awaiting when permissions are pending (regardless of status)', () => {
    expect(deriveSessionVisualState('streaming', 1, conn('connected'))).toBe('awaiting')
    expect(deriveSessionVisualState('idle', 3, conn('connected'))).toBe('awaiting')
  })

  it('returns active for streaming with no permissions', () => {
    expect(deriveSessionVisualState('streaming', 0, conn('connected'))).toBe('active')
  })

  it('returns starting for submitted with no permissions', () => {
    expect(deriveSessionVisualState('submitted', 0, conn('connected'))).toBe('starting')
  })

  it('returns idle for any other status', () => {
    expect(deriveSessionVisualState('idle', 0, conn('connected'))).toBe('idle')
    expect(deriveSessionVisualState('ready', 0, conn('connected'))).toBe('idle')
    expect(deriveSessionVisualState('', 0, null)).toBe('idle')
  })

  it('treats null connection as connected (pre-mount state)', () => {
    expect(deriveSessionVisualState('streaming', 0, null)).toBe('active')
    expect(deriveSessionVisualState('idle', 0, null)).toBe('idle')
  })
})

describe('AnimatedClawdMascot — state → variant mapping', () => {
  const cases: Array<{ state: SessionVisualState; expectedVariant: string | RegExp }> = [
    { state: 'idle', expectedVariant: 'idle-living' },
    { state: 'disconnected', expectedVariant: 'disconnected' },
    { state: 'awaiting', expectedVariant: /^notification|^awaiting/ },
    { state: 'starting', expectedVariant: /^typing|^building|^thinking|^juggling|^conducting|^debugger|^sweeping|^wizard|^overheated|^beacon|^carrying|^confused|^pushing/ },
    { state: 'active', expectedVariant: /^typing|^building|^thinking|^juggling|^conducting|^debugger|^sweeping|^wizard|^overheated|^beacon|^carrying|^confused|^pushing/ },
  ]

  for (const c of cases) {
    it(`renders the expected variant for state="${c.state}"`, () => {
      const { container } = render(<AnimatedClawdMascot sessionState={c.state} />)
      const variant = getVariantAttr(container)
      expect(variant).not.toBeNull()
      if (typeof c.expectedVariant === 'string') {
        expect(variant).toBe(c.expectedVariant)
      } else {
        expect(variant).toMatch(c.expectedVariant)
      }
    })
  }
})

describe('AnimatedClawdMascot — variety algorithm', () => {
  it('starting → active in the same turn keeps the same working variant', () => {
    const { container, rerender } = render(<AnimatedClawdMascot sessionState="starting" />)
    const firstVariant = getVariantAttr(container)
    rerender(<AnimatedClawdMascot sessionState="active" />)
    const secondVariant = getVariantAttr(container)
    expect(secondVariant).toBe(firstVariant)
  })

  it('idle → starting → idle → starting picks a different working variant', () => {
    const { container, rerender } = render(<AnimatedClawdMascot sessionState="idle" />)
    rerender(<AnimatedClawdMascot sessionState="starting" />)
    const firstWorking = getVariantAttr(container)
    rerender(<AnimatedClawdMascot sessionState="idle" />)
    rerender(<AnimatedClawdMascot sessionState="starting" />)
    const secondWorking = getVariantAttr(container)
    expect(firstWorking).not.toBeNull()
    expect(secondWorking).not.toBeNull()
    expect(secondWorking).not.toBe(firstWorking)
  })

  it('awaiting → active increments activation and picks a new working variant', () => {
    const { container, rerender } = render(<AnimatedClawdMascot sessionState="starting" />)
    const beforeAwait = getVariantAttr(container)
    rerender(<AnimatedClawdMascot sessionState="awaiting" />)
    rerender(<AnimatedClawdMascot sessionState="active" />)
    const afterAwait = getVariantAttr(container)
    expect(afterAwait).not.toBeNull()
    expect(afterAwait).not.toBe(beforeAwait)
  })
})

describe('AnimatedClawdMascot — accessibility', () => {
  it('passes aria-hidden through to the rendered SVG', () => {
    const { container } = render(
      <AnimatedClawdMascot sessionState="idle" aria-hidden="true" />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('role')).toBe('presentation')
  })

  it('renders role="img" with aria-label when not hidden', () => {
    const { container } = render(
      <AnimatedClawdMascot sessionState="idle" aria-hidden={false} />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Claude Code')
  })
})

describe('AnimatedClawdMascot — CSS class isolation', () => {
  it('two simultaneously-rendered instances have no overlapping animation classes', () => {
    const { container } = render(
      <>
        <AnimatedClawdMascot sessionState="idle" />
        <AnimatedClawdMascot sessionState="disconnected" />
      </>,
    )
    const svgs = container.querySelectorAll('svg[data-variant]')
    expect(svgs.length).toBe(2)
    const styleA = svgs[0].querySelector('style')?.textContent ?? ''
    const styleB = svgs[1].querySelector('style')?.textContent ?? ''
    expect(styleA.length).toBeGreaterThan(0)
    expect(styleB.length).toBeGreaterThan(0)

    const classNamesA = Array.from(styleA.matchAll(/\.([\w-]+)\s*\{/g)).map((m) => m[1])
    const classNamesB = Array.from(styleB.matchAll(/\.([\w-]+)\s*\{/g)).map((m) => m[1])
    expect(classNamesA.length).toBeGreaterThan(0)
    expect(classNamesB.length).toBeGreaterThan(0)

    const overlap = classNamesA.filter((n) => classNamesB.includes(n))
    expect(overlap).toEqual([])
  })

  it('every variant has its prefix on every class and keyframe', () => {
    const variants: Array<{ state: SessionVisualState; prefix: RegExp }> = [
      { state: 'idle', prefix: /^clawd-idle-/ },
      { state: 'disconnected', prefix: /^clawd-disconnected-/ },
      { state: 'awaiting', prefix: /^clawd-notification-/ },
    ]
    for (const v of variants) {
      const { container, unmount } = render(<AnimatedClawdMascot sessionState={v.state} />)
      const styleText = container.querySelector('style')?.textContent ?? ''
      expect(styleText.length).toBeGreaterThan(0)
      const classNames = Array.from(styleText.matchAll(/\.([\w-]+)\s*\{/g)).map((m) => m[1])
      const keyframeNames = Array.from(styleText.matchAll(/@keyframes\s+([\w-]+)/g)).map((m) => m[1])
      expect(classNames.length).toBeGreaterThan(0)
      expect(keyframeNames.length).toBeGreaterThan(0)
      for (const name of [...classNames, ...keyframeNames]) {
        expect(name).toMatch(v.prefix)
      }
      unmount()
    }
  })
})
