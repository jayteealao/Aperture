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
  claude_code: 'Claude Code',
  codex: 'Codex',
  gemini: 'Gemini',
}

export const AUTH_MODE_LABELS: Record<string, string> = {
  interactive: 'Interactive',
  api_key: 'API Key',
  oauth: 'OAuth',
  vertex: 'Vertex AI',
}

export const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
}
