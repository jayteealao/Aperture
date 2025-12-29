import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CredentialStore } from '../src/credentials.js';
import { unlinkSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

describe('CredentialStore', () => {
  const testStorePath = '/tmp/test-credentials.json.enc';
  const masterKey = randomBytes(32).toString('hex'); // 64 char hex = 32 bytes
  let store: CredentialStore;

  beforeEach(async () => {
    // Clean up test file if it exists
    if (existsSync(testStorePath)) {
      unlinkSync(testStorePath);
    }

    store = new CredentialStore(masterKey, testStorePath);
    await store.init();
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(testStorePath)) {
      unlinkSync(testStorePath);
    }
  });

  it('should store and retrieve credentials', async () => {
    const stored = await store.store('anthropic', 'My API Key', 'sk-ant-test123');

    expect(stored.id).toBeDefined();
    expect(stored.provider).toBe('anthropic');
    expect(stored.label).toBe('My API Key');
    expect(stored.createdAt).toBeGreaterThan(0);
    expect((stored as any).apiKey).toBeUndefined(); // Should not return API key in stored object

    const retrieved = store.get(stored.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.apiKey).toBe('sk-ant-test123');
  });

  it('should list credentials without exposing API keys', async () => {
    await store.store('anthropic', 'Key 1', 'sk-ant-111');
    await store.store('openai', 'Key 2', 'sk-222');

    const list = store.list();

    expect(list).toHaveLength(2);
    expect(list[0].label).toBeDefined();
    expect((list[0] as any).apiKey).toBeUndefined();
    expect((list[1] as any).apiKey).toBeUndefined();
  });

  it('should delete credentials', async () => {
    const stored = await store.store('anthropic', 'Test', 'sk-test');

    const deleted = await store.delete(stored.id);
    expect(deleted).toBe(true);

    const retrieved = store.get(stored.id);
    expect(retrieved).toBeUndefined();

    // Deleting again should return false
    const deletedAgain = await store.delete(stored.id);
    expect(deletedAgain).toBe(false);
  });

  it('should persist credentials across store instances', async () => {
    const stored = await store.store('anthropic', 'Persistent', 'sk-persist');

    // Create new store instance with same master key and path
    const store2 = new CredentialStore(masterKey, testStorePath);
    await store2.init();

    const retrieved = store2.get(stored.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.apiKey).toBe('sk-persist');
  });

  it('should fail with wrong master key', async () => {
    await store.store('anthropic', 'Test', 'sk-test');

    // Try to load with different master key
    const wrongKey = randomBytes(32).toString('hex');
    const badStore = new CredentialStore(wrongKey, testStorePath);

    await expect(badStore.init()).rejects.toThrow();
  });

  it('should reject master key that is too short', () => {
    expect(() => {
      new CredentialStore('too-short', testStorePath);
    }).toThrow('at least 32 characters');
  });

  it('should check if store is enabled', () => {
    expect(CredentialStore.isEnabled(masterKey)).toBe(true);
    expect(CredentialStore.isEnabled('short')).toBe(false);
    expect(CredentialStore.isEnabled(undefined)).toBe(false);
  });
});
