/**
 * Multi-Tab Synchronization for Aperture
 * Uses BroadcastChannel API to sync state across browser tabs
 */

class TabSync {
  constructor() {
    this.channel = null;
    this.listeners = new Map();
    this.tabId = this.generateTabId();
    this.init();
  }

  /**
   * Initialize BroadcastChannel
   */
  init() {
    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[Sync] BroadcastChannel not supported, multi-tab sync disabled');
      return;
    }

    this.channel = new BroadcastChannel('aperture-sync');

    this.channel.onmessage = (event) => {
      const message = event.data;

      // Ignore messages from this tab
      if (message.tabId === this.tabId) {
        return;
      }

      console.log('[Sync] Received:', message);

      // Dispatch to registered listeners
      const listeners = this.listeners.get(message.type) || [];
      listeners.forEach(listener => {
        try {
          listener(message.data);
        } catch (error) {
          console.error('[Sync] Listener error:', error);
        }
      });

      // Dispatch to wildcard listeners
      const wildcardListeners = this.listeners.get('*') || [];
      wildcardListeners.forEach(listener => {
        try {
          listener(message);
        } catch (error) {
          console.error('[Sync] Wildcard listener error:', error);
        }
      });
    };

    this.channel.onmessageerror = (error) => {
      console.error('[Sync] Message error:', error);
    };

    console.log('[Sync] Initialized with tab ID:', this.tabId);
  }

  /**
   * Generate a unique tab ID
   * @returns {string}
   */
  generateTabId() {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Broadcast an event to other tabs
   * @param {string} type - Event type
   * @param {any} data - Event data
   */
  broadcast(type, data) {
    if (!this.channel) {
      return;
    }

    const message = {
      type,
      data,
      tabId: this.tabId,
      timestamp: Date.now()
    };

    try {
      this.channel.postMessage(message);
      console.log('[Sync] Broadcast:', type, data);
    } catch (error) {
      console.error('[Sync] Failed to broadcast:', error);
    }
  }

  /**
   * Register a listener for an event type
   * @param {string} type - Event type (use '*' for all events)
   * @param {Function} listener - Callback function
   */
  on(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }

    this.listeners.get(type).push(listener);
  }

  /**
   * Remove a listener for an event type
   * @param {string} type - Event type
   * @param {Function} listener - Callback function to remove
   */
  off(type, listener) {
    if (!this.listeners.has(type)) {
      return;
    }

    const listeners = this.listeners.get(type);
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Close the channel
   */
  close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
      console.log('[Sync] Channel closed');
    }
  }
}

// Event types for consistency
export const SyncEvents = {
  SESSION_CREATED: 'session_created',
  SESSION_UPDATED: 'session_updated',
  SESSION_DELETED: 'session_deleted',
  MESSAGE_ADDED: 'message_added',
  MESSAGE_UPDATED: 'message_updated',
  STATE_CHANGED: 'state_changed',
  DB_CLEARED: 'db_cleared'
};

// Export singleton instance
export const tabSync = new TabSync();
