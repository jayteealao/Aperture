import type { CSSProperties } from 'react'
import { startTransition, useEffect, useMemo, useState } from 'react'
import { codeToHtml } from '@/lib/shiki.bundle'
import { useAppStore } from '@/stores/app'
import { cn } from '@/utils/cn'
import type { BundledLanguage, BundledTheme } from '@/lib/shiki.bundle'

interface CodeHighlightProps {
  code: string
  language: BundledLanguage | null
  className?: string
  style?: CSSProperties
}

const highlightedHtmlCache = new Map<string, string>()

const THEME_BY_MODE: Record<'light' | 'dark', BundledTheme> = {
  light: 'github-light',
  dark: 'github-dark',
}

function getCacheKey(code: string, language: BundledLanguage, theme: BundledTheme) {
  return `${theme}:${language}:${code}`
}

export function CodeHighlight({ code, language, className, style }: CodeHighlightProps) {
  const themeMode = useAppStore((state) => state.theme)
  const theme = THEME_BY_MODE[themeMode]
  const cacheKey = useMemo(
    () => (language ? getCacheKey(code, language, theme) : null),
    [code, language, theme]
  )
  const [highlightState, setHighlightState] = useState<{ cacheKey: string | null; html: string | null }>(() => {
    if (!cacheKey) {
      return { cacheKey: null, html: null }
    }

    return { cacheKey, html: highlightedHtmlCache.get(cacheKey) ?? null }
  })
  const html = highlightState.cacheKey === cacheKey ? highlightState.html : null

  useEffect(() => {
    if (!cacheKey || !language) {
      setHighlightState({ cacheKey, html: null })
      return
    }

    const cachedHtml = highlightedHtmlCache.get(cacheKey)
    if (cachedHtml) {
      setHighlightState({ cacheKey, html: cachedHtml })
      return
    }

    let cancelled = false
    setHighlightState({ cacheKey, html: null })

    void codeToHtml(code, { lang: language, theme })
      .then((result) => {
        if (cancelled) {
          return
        }

        highlightedHtmlCache.set(cacheKey, result)
        startTransition(() => {
          setHighlightState({ cacheKey, html: result })
        })
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        startTransition(() => {
          setHighlightState({ cacheKey, html: null })
        })
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, code, language, theme])

  if (!html) {
    return (
      <pre
        className={cn(
          'm-0 max-w-full overflow-x-auto rounded-lg bg-muted px-3 py-3 font-mono text-xs text-foreground',
          className
        )}
        style={style}
      >
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className={cn(
        'max-w-full [&_.shiki]:m-0 [&_.shiki]:max-w-full [&_.shiki]:overflow-x-auto [&_.shiki]:rounded-lg [&_.shiki]:px-3 [&_.shiki]:py-3 [&_.shiki]:text-xs [&_.shiki]:leading-relaxed',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
      style={style}
    />
  )
}
