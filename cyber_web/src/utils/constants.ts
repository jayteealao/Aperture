import type { ModelInfo } from '@/api/types'

// Default SDK models available before API response
export const DEFAULT_SDK_MODELS: ModelInfo[] = [
  { value: 'sonnet', displayName: 'Claude Sonnet', description: 'Fast and efficient' },
  { value: 'opus', displayName: 'Claude Opus', description: 'Most capable' },
  { value: 'haiku', displayName: 'Claude Haiku', description: 'Quick responses' },
]

// Pi thinking levels
export const PI_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const

// HUD visual constants
export const HUD = {
  GRID_SIZE: 32,
  CORNER_SIZE: 16,
  BORDER_WIDTH: 1,
  TRANSITION_DURATION: 200,
} as const

// Session polling interval
export const POLLING_INTERVAL = 5000
