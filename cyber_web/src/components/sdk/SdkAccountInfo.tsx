// SDK Account Info - Email, organization, subscription type

import { Badge, Spinner } from '@/components/ui'
import { User, Building2, CreditCard, Key } from 'lucide-react'
import type { AccountInfo } from '@/api/types'

interface SdkAccountInfoProps {
  accountInfo: AccountInfo | null
  loading: boolean
  error?: string
}

export function SdkAccountInfo({ accountInfo, loading, error }: SdkAccountInfoProps) {
  // Check if we need to send a prompt first
  const needsPrompt = error?.includes('No active query')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Spinner size="sm" />
      </div>
    )
  }

  if (needsPrompt) {
    return (
      <div className="text-xs text-hud-text/50 text-center py-3">
        Account info loads after the first prompt
      </div>
    )
  }

  if (!accountInfo) {
    return (
      <div className="text-xs text-hud-text/50 text-center py-3">
        No account info available
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {accountInfo.email && (
        <InfoRow icon={<User size={14} />} label="Email" value={accountInfo.email} />
      )}
      {accountInfo.organization && (
        <InfoRow icon={<Building2 size={14} />} label="Org" value={accountInfo.organization} />
      )}
      {accountInfo.subscriptionType && (
        <InfoRow
          icon={<CreditCard size={14} />}
          label="Plan"
          value={
            <Badge
              variant={accountInfo.subscriptionType === 'pro' ? 'accent' : 'default'}
            >
              {accountInfo.subscriptionType}
            </Badge>
          }
        />
      )}
      {accountInfo.tokenSource && (
        <InfoRow icon={<Key size={14} />} label="Auth" value={accountInfo.tokenSource} />
      )}
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs text-hud-text/50">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xs text-hud-text truncate max-w-[140px]">
        {value}
      </div>
    </div>
  )
}
