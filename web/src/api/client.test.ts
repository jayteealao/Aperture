import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

describe('ApertureClient URL encoding', () => {
  beforeEach(() => {
    api.configure('http://localhost:8080', 'test-token')
  })

  describe('getWebSocketUrl', () => {
    it('encodes session ID containing a slash', () => {
      const url = api.getWebSocketUrl('feature/login')
      expect(url).toContain('feature%2Flogin')
      expect(url).not.toMatch(/feature\/login\/ws/)
    })

    it('encodes session ID containing a question mark', () => {
      const url = api.getWebSocketUrl('session?evil=1')
      expect(url).toContain('session%3Fevil%3D1')
    })

    it('encodes session ID containing a hash', () => {
      const url = api.getWebSocketUrl('sess#frag')
      expect(url).toContain('sess%23frag')
    })

    it('leaves plain UUID session IDs unchanged', () => {
      const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      expect(api.getWebSocketUrl(id)).toContain(id)
    })

    it('encodes the bearer token in the query string', () => {
      api.configure('http://localhost:8080', 'tok en+special')
      const url = api.getWebSocketUrl('sess-1')
      expect(url).toContain('tok%20en%2Bspecial')
    })

    it('converts http base URL to ws scheme', () => {
      expect(api.getWebSocketUrl('s')).toMatch(/^ws:\/\//)
    })

    it('converts https base URL to wss scheme', () => {
      api.configure('https://example.com', 'token')
      expect(api.getWebSocketUrl('s')).toMatch(/^wss:\/\//)
    })
  })
})

describe('REST path encoding', () => {
  beforeEach(() => {
    api.configure('http://localhost:8080', 'test-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deleteSession encodes a session ID containing a slash', async () => {
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      return { ok: true, status: 204 } as Response
    })
    await api.deleteSession('feature/login')
    expect(fetched[0]).toContain('/feature%2Flogin')
  })
})
