import { get as idbGet, set as idbSet } from 'idb-keyval'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { coerceStoredMessagesToUIMessages, legacyMessageToUIMessage } from '@/utils/ui-message'

/** O(1) fingerprint for dedup — avoids JSON.stringify on every streaming delta */
function messageFingerprint(messages: ApertureUIMessage[]): string {
  if (messages.length === 0) return '0:'
  const last = messages[messages.length - 1]
  // Count + last ID + last parts length gives a cheap change signal
  const partsLen = last.parts?.length ?? 0
  return `${messages.length}:${last.id}:${partsLen}`
}

export function usePersistedUIMessages(sessionId: string) {
  const [messages, setMessages] = useState<ApertureUIMessage[] | null>(null)
  const lastFingerprintRef = useRef('')

  const loadMessages = useCallback(async () => {
    try {
      const response = await api.getSessionMessages(sessionId)
      const nextMessages = response.messages.map(legacyMessageToUIMessage)
      lastFingerprintRef.current = messageFingerprint(nextMessages)
      await idbSet(`ui-messages:${sessionId}`, nextMessages)
      return nextMessages
    } catch {
      const stored = await idbGet(`ui-messages:${sessionId}`)
      const nextMessages = coerceStoredMessagesToUIMessages(stored)
      lastFingerprintRef.current = messageFingerprint(nextMessages)
      return nextMessages
    }
  }, [sessionId])

  useEffect(() => {
    let cancelled = false

    loadMessages().then((nextMessages) => {
      if (!cancelled) {
        setMessages(nextMessages)
      }
    })

    return () => {
      cancelled = true
    }
  }, [loadMessages])

  // Stable reference — sessionId is the only dependency that changes the IDB key.
  // Without useCallback, consumers using persistMessages in useEffect deps re-fire every render.
  const persistMessages = useCallback(async (nextMessages: ApertureUIMessage[]) => {
    const fingerprint = messageFingerprint(nextMessages)
    if (fingerprint === lastFingerprintRef.current) {
      return
    }

    lastFingerprintRef.current = fingerprint
    await idbSet(`ui-messages:${sessionId}`, nextMessages)
  }, [sessionId])

  const reloadMessages = useCallback(async () => {
    const nextMessages = await loadMessages()
    setMessages(nextMessages)
    return nextMessages
  }, [loadMessages])

  return { initialMessages: messages, persistMessages, reloadMessages }
}
