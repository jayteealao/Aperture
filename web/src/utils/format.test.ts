import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelativeTime, formatDate, formatTime, truncate } from './format'

describe('format utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatRelativeTime', () => {
    it('formats just now for under a minute', () => {
      const date = new Date('2024-06-15T11:59:30Z')
      expect(formatRelativeTime(date)).toBe('just now')
    })

    it('formats minutes ago', () => {
      const date = new Date('2024-06-15T11:55:00Z')
      expect(formatRelativeTime(date)).toBe('5m ago')
    })

    it('formats hours ago', () => {
      const date = new Date('2024-06-15T09:00:00Z')
      expect(formatRelativeTime(date)).toBe('3h ago')
    })

    it('formats days ago', () => {
      const date = new Date('2024-06-13T12:00:00Z')
      expect(formatRelativeTime(date)).toBe('2d ago')
    })
  })

  describe('truncate', () => {
    it('returns full string if under limit', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('truncates and adds ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello wo...')
    })

    it('handles empty string', () => {
      expect(truncate('', 10)).toBe('')
    })
  })
})
