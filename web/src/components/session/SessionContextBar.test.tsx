// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { SessionContextBar } from './SessionContextBar'
import type { SessionResult, ModelUsage } from '@/api/types'

afterEach(cleanup)

function modelUsage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 200000,
    maxOutputTokens: 8192,
    ...overrides,
  }
}

function sessionResult(
  usage: Record<string, ModelUsage>,
): SessionResult {
  return {
    success: true,
    subtype: 'success',
    numTurns: 1,
    durationMs: 1000,
    durationApiMs: 800,
    totalCostUsd: 0.01,
    usage,
    permissionDenials: [],
  }
}

describe('SessionContextBar', () => {
  it('renders mascot without fill bar when usage is null', () => {
    render(
      <SessionContextBar
        usage={null}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const button = screen.getByLabelText('Open SDK sidebar')
    expect(button.querySelector('svg')).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('renders mascot without fill bar when usage has no models', () => {
    const usage = sessionResult({})
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('renders mascot without fill bar when contextWindow is absent', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 5000,
        contextWindow: undefined,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('renders fill bar with correct width for given usage', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 100000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    expect(bar.getAttribute('aria-label')).toBe('Context: 50%')
    const fill = bar.firstChild as HTMLElement
    expect(fill.style.width).toBe('50%')
  })

  it('caps percent at 100 when tokens exceed context window', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 250000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
  })

  it('uses neutral color below 80%', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 100000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const fill = screen.getByRole('progressbar').firstChild as HTMLElement
    expect(fill.classList.contains('bg-muted-foreground/60')).toBe(true)
  })

  it('uses warning color at 80%+', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 170000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const fill = screen.getByRole('progressbar').firstChild as HTMLElement
    expect(fill.classList.contains('bg-warning')).toBe(true)
  })

  it('uses destructive color at 95%+', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 195000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const fill = screen.getByRole('progressbar').firstChild as HTMLElement
    expect(fill.classList.contains('bg-destructive')).toBe(true)
  })

  it('sums tokens across multiple models', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 40000,
        cacheReadInputTokens: 10000,
        cacheCreationInputTokens: 10000,
        contextWindow: 200000,
      }),
      'claude-opus': modelUsage({
        inputTokens: 30000,
        cacheReadInputTokens: 5000,
        cacheCreationInputTokens: 5000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    // Total: 40+10+10+0 + 30+5+5+0 = 100k / 200k = 50%
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
  })

  it('invokes onClickSidebar when clicked', () => {
    const onClick = vi.fn()
    const usage = sessionResult({
      'claude-sonnet': modelUsage({ inputTokens: 5000 }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={onClick}
      />,
    )

    fireEvent.click(screen.getByLabelText('Open SDK sidebar'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies opacity-50 when data is stale', () => {
    const fiveMinutesAgo = Date.now() - 6 * 60 * 1000
    const usage = sessionResult({
      'claude-sonnet': modelUsage({ inputTokens: 5000 }),
    })
    act(() => {
      render(
        <SessionContextBar
          usage={usage}
          isActive={false}
          onClickSidebar={vi.fn()}
          lastActivityTime={fiveMinutesAgo}
        />,
      )
    })

    const button = screen.getByLabelText('Open SDK sidebar')
    expect(button.classList.contains('opacity-50')).toBe(true)
  })

  it('applies full opacity when data is fresh', () => {
    const recentTime = Date.now() - 1000
    const usage = sessionResult({
      'claude-sonnet': modelUsage({ inputTokens: 5000 }),
    })
    act(() => {
      render(
        <SessionContextBar
          usage={usage}
          isActive={false}
          onClickSidebar={vi.fn()}
          lastActivityTime={recentTime}
        />,
      )
    })

    const button = screen.getByLabelText('Open SDK sidebar')
    expect(button.classList.contains('opacity-100')).toBe(true)
  })

  it('applies primary color to mascot when active', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({ inputTokens: 5000 }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={true}
        onClickSidebar={vi.fn()}
      />,
    )

    const svg = screen.getByLabelText('Open SDK sidebar').querySelector('svg')
    expect(svg?.classList.contains('text-[var(--primary)]')).toBe(true)
  })

  it('applies muted-foreground to mascot when inactive', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({ inputTokens: 5000 }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const svg = screen.getByLabelText('Open SDK sidebar').querySelector('svg')
    expect(svg?.classList.contains('text-muted-foreground')).toBe(true)
  })

  it('passes className through to the button wrapper', () => {
    render(
      <SessionContextBar
        usage={null}
        isActive={false}
        onClickSidebar={vi.fn()}
        className="my-custom-class"
      />,
    )

    const button = screen.getByLabelText('Open SDK sidebar')
    expect(button.classList.contains('my-custom-class')).toBe(true)
  })

  describe('staleness polling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('transitions from fresh to stale after polling interval', () => {
      const recentTime = Date.now() - 1000
      const usage = sessionResult({
        'claude-sonnet': modelUsage({ inputTokens: 5000 }),
      })
      render(
        <SessionContextBar
          usage={usage}
          isActive={false}
          onClickSidebar={vi.fn()}
          lastActivityTime={recentTime}
        />,
      )

      const button = screen.getByLabelText('Open SDK sidebar')
      expect(button.classList.contains('opacity-100')).toBe(true)

      // Advance past stale threshold (5 min) + one polling interval (30s)
      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000 + 30 * 1000)
      })

      expect(button.classList.contains('opacity-50')).toBe(true)
    })

    it('clears interval on unmount', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      const recentTime = Date.now() - 1000
      const usage = sessionResult({
        'claude-sonnet': modelUsage({ inputTokens: 5000 }),
      })
      const { unmount } = render(
        <SessionContextBar
          usage={usage}
          isActive={false}
          onClickSidebar={vi.fn()}
          lastActivityTime={recentTime}
        />,
      )

      unmount()
      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })

  it('renders sr-only context summary for screen readers', () => {
    const usage = sessionResult({
      'claude-sonnet': modelUsage({
        inputTokens: 100000,
        contextWindow: 200000,
      }),
    })
    render(
      <SessionContextBar
        usage={usage}
        isActive={false}
        onClickSidebar={vi.fn()}
      />,
    )

    const srOnly = screen.getByText(/50%, .* of .* tokens used/)
    expect(srOnly.classList.contains('sr-only')).toBe(true)
  })

  it('uses Close label when sdkSidebarOpen is true', () => {
    render(
      <SessionContextBar
        usage={null}
        isActive={false}
        sdkSidebarOpen={true}
        onClickSidebar={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Close SDK sidebar')).toBeTruthy()
  })
})
