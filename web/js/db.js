/**
 * IndexedDB Wrapper for Aperture
 * Provides persistent storage for sessions and messages
 */

const DB_NAME = 'aperture-db';
const DB_VERSION = 1;

class ApertureDB {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize the database
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[DB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[DB] Database opened successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('[DB] Upgrading database schema...');

        // Sessions object store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionsStore.createIndex('createdAt', 'createdAt', { unique: false });
          sessionsStore.createIndex('lastActivityAt', 'lastActivityAt', { unique: false });
          sessionsStore.createIndex('status', 'status', { unique: false });
          console.log('[DB] Created sessions store');
        }

        // Messages object store
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
          messagesStore.createIndex('sessionId', 'sessionId', { unique: false });
          messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
          messagesStore.createIndex('sessionId_timestamp', ['sessionId', 'timestamp'], { unique: false });
          console.log('[DB] Created messages store');
        }

        // Metadata object store
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
          console.log('[DB] Created metadata store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized
   */
  async ensureInit() {
    if (!this.db) {
      await this.init();
    }
  }

  // ==================== Session Methods ====================

  /**
   * Save or update a session
   * @param {Object} session - Session object
   * @returns {Promise<void>}
   */
  async saveSession(session) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readwrite');
      const store = tx.objectStore('sessions');

      const sessionData = {
        ...session,
        createdAt: session.createdAt || Date.now(),
        lastActivityAt: session.lastActivityAt || Date.now(),
        status: session.status || 'active'
      };

      const request = store.put(sessionData);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('[DB] Failed to save session:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a session by ID
   * @param {string} id - Session ID
   * @returns {Promise<Object|null>}
   */
  async getSession(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.error('[DB] Failed to get session:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all sessions, sorted by lastActivityAt descending
   * @returns {Promise<Array>}
   */
  async getAllSessions() {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const sessions = request.result || [];
        // Sort by lastActivityAt descending (most recent first)
        sessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
        resolve(sessions);
      };
      request.onerror = () => {
        console.error('[DB] Failed to get all sessions:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get active sessions only
   * @returns {Promise<Array>}
   */
  async getActiveSessions() {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const index = store.index('status');
      const request = index.getAll('active');

      request.onsuccess = () => {
        const sessions = request.result || [];
        sessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
        resolve(sessions);
      };
      request.onerror = () => {
        console.error('[DB] Failed to get active sessions:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update session activity timestamp
   * @param {string} id - Session ID
   * @param {number} timestamp - Activity timestamp
   * @returns {Promise<void>}
   */
  async updateSessionActivity(id, timestamp = Date.now()) {
    await this.ensureInit();

    const session = await this.getSession(id);
    if (session) {
      session.lastActivityAt = timestamp;
      await this.saveSession(session);
    }
  }

  /**
   * Update session status
   * @param {string} id - Session ID
   * @param {string} status - New status
   * @returns {Promise<void>}
   */
  async updateSessionStatus(id, status) {
    await this.ensureInit();

    const session = await this.getSession(id);
    if (session) {
      session.status = status;
      session.lastActivityAt = Date.now();
      await this.saveSession(session);
    }
  }

  /**
   * Delete a session and all its messages
   * @param {string} id - Session ID
   * @returns {Promise<void>}
   */
  async deleteSession(id) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions', 'messages'], 'readwrite');

      // Delete session
      const sessionsStore = tx.objectStore('sessions');
      sessionsStore.delete(id);

      // Delete all messages for this session
      const messagesStore = tx.objectStore('messages');
      const index = messagesStore.index('sessionId');
      const range = IDBKeyRange.only(id);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error('[DB] Failed to delete session:', tx.error);
        reject(tx.error);
      };
    });
  }

  // ==================== Message Methods ====================

  /**
   * Save a message
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message object
   * @returns {Promise<void>}
   */
  async saveMessage(sessionId, message) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');

      const messageData = {
        ...message,
        sessionId,
        timestamp: message.timestamp || new Date().toISOString()
      };

      const request = store.put(messageData);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('[DB] Failed to save message:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Save multiple messages in a batch
   * @param {string} sessionId - Session ID
   * @param {Array} messages - Array of message objects
   * @returns {Promise<void>}
   */
  async saveMessages(sessionId, messages) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');

      for (const message of messages) {
        const messageData = {
          ...message,
          sessionId,
          timestamp: message.timestamp || new Date().toISOString()
        };
        store.put(messageData);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error('[DB] Failed to save messages:', tx.error);
        reject(tx.error);
      };
    });
  }

  /**
   * Get messages for a session
   * @param {string} sessionId - Session ID
   * @param {number} limit - Maximum number of messages (default: all)
   * @param {number} offset - Offset for pagination (default: 0)
   * @returns {Promise<Array>}
   */
  async getMessages(sessionId, limit = null, offset = 0) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('sessionId_timestamp');
      const range = IDBKeyRange.bound([sessionId, ''], [sessionId, '\uffff']);
      const request = index.getAll(range);

      request.onsuccess = () => {
        let messages = request.result || [];

        // Apply offset and limit
        if (offset > 0) {
          messages = messages.slice(offset);
        }
        if (limit !== null && limit > 0) {
          messages = messages.slice(0, limit);
        }

        resolve(messages);
      };
      request.onerror = () => {
        console.error('[DB] Failed to get messages:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get the last message for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>}
   */
  async getLastMessage(sessionId) {
    await this.ensureInit();

    const messages = await this.getMessages(sessionId);
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  /**
   * Get message count for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<number>}
   */
  async getMessageCount(sessionId) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('sessionId');
      const request = index.count(sessionId);

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => {
        console.error('[DB] Failed to count messages:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update a message
   * @param {string} sessionId - Session ID
   * @param {string} messageId - Message ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<void>}
   */
  async updateMessage(sessionId, messageId, updates) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.get(messageId);

      request.onsuccess = () => {
        const message = request.result;
        if (message && message.sessionId === sessionId) {
          const updated = { ...message, ...updates };
          store.put(updated);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error('[DB] Failed to update message:', tx.error);
        reject(tx.error);
      };
    });
  }

  /**
   * Delete all messages for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async deleteMessages(sessionId) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['messages'], 'readwrite');
      const store = tx.objectStore('messages');
      const index = store.index('sessionId');
      const range = IDBKeyRange.only(sessionId);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        console.error('[DB] Failed to delete messages:', tx.error);
        reject(tx.error);
      };
    });
  }

  // ==================== Metadata Methods ====================

  /**
   * Set a metadata value
   * @param {string} key - Metadata key
   * @param {any} value - Metadata value
   * @returns {Promise<void>}
   */
  async setMeta(key, value) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['metadata'], 'readwrite');
      const store = tx.objectStore('metadata');
      const request = store.put({ key, value });

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error('[DB] Failed to set metadata:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get a metadata value
   * @param {string} key - Metadata key
   * @returns {Promise<any>}
   */
  async getMeta(key) {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['metadata'], 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => {
        console.error('[DB] Failed to get metadata:', request.error);
        reject(request.error);
      };
    });
  }

  // ==================== Search Methods ====================

  /**
   * Search sessions by content or metadata
   * @param {string} query - Search query
   * @returns {Promise<Array>}
   */
  async searchSessions(query) {
    await this.ensureInit();

    if (!query || query.trim() === '') {
      return this.getAllSessions();
    }

    const queryLower = query.toLowerCase();
    const sessions = await this.getAllSessions();
    const matches = [];

    for (const session of sessions) {
      // Search session metadata
      if (
        session.id.toLowerCase().includes(queryLower) ||
        session.agent?.toLowerCase().includes(queryLower) ||
        session.status?.toLowerCase().includes(queryLower)
      ) {
        matches.push(session);
        continue;
      }

      // Search message content
      const messages = await this.getMessages(session.id);
      const hasMatch = messages.some(m =>
        m.content &&
        typeof m.content === 'string' &&
        m.content.toLowerCase().includes(queryLower)
      );

      if (hasMatch) {
        matches.push(session);
      }
    }

    return matches;
  }

  // ==================== Utility Methods ====================

  /**
   * Clear all data (for testing/debugging)
   * @returns {Promise<void>}
   */
  async clearAll() {
    await this.ensureInit();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['sessions', 'messages', 'metadata'], 'readwrite');

      tx.objectStore('sessions').clear();
      tx.objectStore('messages').clear();
      tx.objectStore('metadata').clear();

      tx.oncomplete = () => {
        console.log('[DB] All data cleared');
        resolve();
      };
      tx.onerror = () => {
        console.error('[DB] Failed to clear data:', tx.error);
        reject(tx.error);
      };
    });
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    await this.ensureInit();

    const sessions = await this.getAllSessions();
    const activeSessions = sessions.filter(s => s.status === 'active');

    let totalMessages = 0;
    for (const session of sessions) {
      const count = await this.getMessageCount(session.id);
      totalMessages += count;
    }

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      totalMessages
    };
  }

  /**
   * Close the database
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
      console.log('[DB] Database closed');
    }
  }
}

// Export singleton instance
export const db = new ApertureDB();
