// App constants

export const APP_NAME = 'Aperture'
export const APP_VERSION = '1.0.0'

export const DEFAULT_GATEWAY_URL = import.meta.env.VITE_DEFAULT_GATEWAY_URL || 'http://localhost:8080'

export const WEBSOCKET_RETRY_DELAY = 1000
export const WEBSOCKET_MAX_RETRY_DELAY = 30000
export const WEBSOCKET_MAX_RETRIES = 20

export const MAX_MESSAGE_LENGTH = 1024 * 1024 // 1MB
export const MAX_CONNECTIONS = 10

export const STORAGE_KEYS = {
  gatewayUrl: 'aperture:gatewayUrl',
  apiToken: 'aperture:apiToken',
  theme: 'aperture:theme',
  isConnected: 'aperture:isConnected',
} as const

export const AGENT_LABELS: Record<string, string> = {
  claude_sdk: 'Claude',
}

export const AUTH_MODE_LABELS: Record<string, string> = {
  api_key: 'API Key',
  oauth: 'OAuth',
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
}

// Default SDK models to show before first prompt (SDK requires active query for real model list)
export const DEFAULT_SDK_MODELS = [
  { value: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', description: 'Latest Sonnet model' },
  { value: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', description: 'Most capable model' },
  { value: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', description: 'Fast and efficient' },
] as const
