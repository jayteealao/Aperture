/**
 * Thin wrapper around Sonner that preserves the app's existing toast call
 * signature: toast.success(title, description?) / toast.error(title, description?)
 *
 * This is the single canonical callsite adapter. All consumers import from here,
 * not directly from 'sonner', so the signature is one source of truth.
 */
import { toast as sonnerToast } from 'sonner'

function success(title: string, description?: string) {
  return sonnerToast.success(title, description ? { description } : undefined)
}

function error(title: string, description?: string) {
  return sonnerToast.error(title, description ? { description } : undefined)
}

function warning(title: string, description?: string) {
  return sonnerToast.warning(title, description ? { description } : undefined)
}

function info(title: string, description?: string) {
  return sonnerToast.info(title, description ? { description } : undefined)
}

export const toast = { success, error, warning, info }
