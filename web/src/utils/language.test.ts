import { describe, expect, it } from 'vitest'
import { getLanguageFromPath, normalizeLanguage } from './language'

describe('normalizeLanguage', () => {
  it('maps common aliases to bundled languages', () => {
    expect(normalizeLanguage('ts')).toBe('typescript')
    expect(normalizeLanguage('shellscript')).toBe('bash')
    expect(normalizeLanguage('YML')).toBe('yaml')
  })

  it('returns null for unsupported languages', () => {
    expect(normalizeLanguage('haskell')).toBeNull()
    expect(normalizeLanguage(undefined)).toBeNull()
  })
})

describe('getLanguageFromPath', () => {
  it('detects bundled languages from file extensions', () => {
    expect(getLanguageFromPath('src/app.tsx')).toBe('tsx')
    expect(getLanguageFromPath('scripts/deploy.sh')).toBe('bash')
    expect(getLanguageFromPath('docs/change.diff')).toBe('diff')
  })

  it('returns null when the path has no supported extension', () => {
    expect(getLanguageFromPath('README')).toBeNull()
    expect(getLanguageFromPath('notes.txt')).toBeNull()
  })
})
