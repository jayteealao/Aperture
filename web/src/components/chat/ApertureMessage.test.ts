import { describe, expect, it } from 'vitest'
import { isSafeUrl } from './ApertureMessage'

describe('isSafeUrl', () => {
  it.each([
    ['https://example.com/image.png', true],
    ['http://localhost:3000/file.txt', true],
    ['data:image/png;base64,abc123', true],
    ['blob:http://localhost/uuid-here', true],
  ])('allows safe protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['javascript:alert(1)', false],
    ['vbscript:msgbox', false],
    ['file:///etc/passwd', false],
    ['ftp://example.com/file', false],
  ])('blocks unsafe protocol: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })

  it.each([
    ['', false],
    ['not-a-url', false],
    ['://missing-scheme', false],
  ])('rejects malformed URL: %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected)
  })
})
