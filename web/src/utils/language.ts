import type { BundledLanguage } from '@/lib/shiki.bundle'

const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  bash: 'bash',
  cjs: 'javascript',
  css: 'css',
  cts: 'typescript',
  diff: 'diff',
  go: 'go',
  html: 'html',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  sql: 'sql',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
}

export function normalizeLanguage(language?: string | null): BundledLanguage | null {
  if (!language) {
    return null
  }

  return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? null
}

export function getLanguageFromPath(path: string): BundledLanguage | null {
  const extension = path.split('.').pop()?.toLowerCase()
  return normalizeLanguage(extension)
}
