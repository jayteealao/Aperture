// Generic session state cleanup helper.
// Eliminates the fragile pattern of manually enumerating every key to delete.
// When a new field is added to a slice's initial state, cleanup automatically covers it.

/**
 * Generate a partial state update that removes `sessionId` from every
 * Record<string, T> field listed in `initialState`.
 *
 * Usage: `set((state) => cleanupSessionState(state, sdkSliceInitialState, sessionId))`
 */
export function cleanupSessionState<
  TInitial extends Record<string, Record<string, unknown>>,
>(
  state: TInitial,
  initialState: TInitial,
  sessionId: string
): Partial<TInitial> {
  const result: Partial<TInitial> = {}
  for (const key of Object.keys(initialState) as (keyof TInitial)[]) {
    const map = state[key]
    if (map && typeof map === 'object' && sessionId in map) {
      const copy = { ...map }
      delete copy[sessionId]
      result[key] = copy as TInitial[keyof TInitial]
    }
  }
  return result
}
