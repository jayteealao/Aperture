import { get as idbGet, set as idbSet } from 'idb-keyval'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApertureUIMessage } from '@/utils/ui-message'
import { coerceStoredMessagesToUIMessages } from '@/utils/ui-message'

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

  useEffect(() => {
    let cancelled = false

    // Use distinct key to avoid collision with legacy message-slice persistence
    idbGet(`ui-messages:${sessionId}`).then((stored) => {
      if (cancelled) {
        return
      }

      const nextMessages = coerceStoredMessagesToUIMessages(stored)
      lastFingerprintRef.current = messageFingerprint(nextMessages)
      setMessages(nextMessages)
    })

    return () => {
      cancelled = true
    }
  }, [sessionId])

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

  return { initialMessages: messages, persistMessages }
}
