import { Toaster as SonnerToaster } from 'sonner'
import { useAppStore } from '@/stores/app'

/**
 * App-level toast renderer. Render once inside Shell — Sonner portals
 * to document.body so placement in the tree doesn't matter.
 */
export function Toaster() {
  const theme = useAppStore((state) => state.theme)
  return (
    <SonnerToaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
    />
  )
}
