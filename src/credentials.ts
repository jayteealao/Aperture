import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { Provider } from './agents/types.js';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface StoredCredential {
  id: string;
  provider: Provider;
  label: string;
  createdAt: number;
}

export interface CredentialWithKey extends StoredCredential {
  apiKey: string;
}

interface EncryptedData {
  salt: string;
  iv: string;
  authTag: string;
  encrypted: string;
}

interface CredentialsData {
  version: number;
  credentials: Record<string, CredentialWithKey>;
}

/**
 * Secure credential storage with AES-256-GCM encryption
 */
export class CredentialStore {
  private masterKey: string;
  private storePath: string;
  private credentials: Map<string, CredentialWithKey> = new Map();

  constructor(masterKey: string, storePath: string = '/data/credentials.json.enc') {
    if (!masterKey || masterKey.length < 32) {
      throw new Error('CREDENTIALS_MASTER_KEY must be at least 32 characters');
    }
    this.masterKey = masterKey;
    this.storePath = storePath;
  }

  /**
   * Initialize the store (load existing credentials)
   */
  async init(): Promise<void> {
    try {
      if (existsSync(this.storePath)) {
        await this.load();
        console.log(`✓ Loaded ${this.credentials.size} stored credentials`);
      } else {
        console.log('✓ Credential store initialized (empty)');
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
      throw new Error('Failed to initialize credential store');
    }
  }

  /**
   * Derive encryption key from master key and salt
   */
  private deriveKey(salt: Buffer): Buffer {
    return scryptSync(this.masterKey, salt, KEY_LENGTH);
  }

  /**
   * Encrypt data
   */
  private encrypt(plaintext: string): EncryptedData {
    const salt = randomBytes(SALT_LENGTH);
    const key = this.deriveKey(salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encrypted: encrypted.toString('base64'),
    };
  }

  /**
   * Decrypt data
   */
  private decrypt(data: EncryptedData): string {
    const salt = Buffer.from(data.salt, 'base64');
    const key = this.deriveKey(salt);
    const iv = Buffer.from(data.iv, 'base64');
    const authTag = Buffer.from(data.authTag, 'base64');
    const encrypted = Buffer.from(data.encrypted, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Load credentials from disk
   */
  private async load(): Promise<void> {
    const encryptedContent = await readFile(this.storePath, 'utf8');
    const encryptedData: EncryptedData = JSON.parse(encryptedContent);

    const decryptedContent = this.decrypt(encryptedData);
    const data: CredentialsData = JSON.parse(decryptedContent);

    if (data.version !== 1) {
      throw new Error(`Unsupported credentials format version: ${data.version}`);
    }

    this.credentials.clear();
    for (const [id, cred] of Object.entries(data.credentials)) {
      this.credentials.set(id, cred);
    }
  }

  /**
   * Save credentials to disk
   */
  private async save(): Promise<void> {
    const data: CredentialsData = {
      version: 1,
      credentials: Object.fromEntries(this.credentials),
    };

    const plaintext = JSON.stringify(data);
    const encrypted = this.encrypt(plaintext);

    // Ensure directory exists
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.storePath, JSON.stringify(encrypted), 'utf8');
  }

  /**
   * Store a new credential
   */
  async store(provider: Provider, label: string, apiKey: string): Promise<StoredCredential> {
    const id = randomBytes(16).toString('hex');
    const credential: CredentialWithKey = {
      id,
      provider,
      label,
      apiKey,
      createdAt: Date.now(),
    };

    this.credentials.set(id, credential);
    await this.save();

    // Return without API key
    const { apiKey: _, ...stored } = credential;
    return stored;
  }

  /**
   * List all stored credentials (without API keys)
   */
  list(): StoredCredential[] {
    return Array.from(this.credentials.values()).map(({ apiKey, ...cred }) => cred);
  }

  /**
   * Get a credential by ID (with API key)
   */
  get(id: string): CredentialWithKey | undefined {
    return this.credentials.get(id);
  }

  /**
   * Delete a credential
   */
  async delete(id: string): Promise<boolean> {
    const deleted = this.credentials.delete(id);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  /**
   * Check if store is enabled
   */
  static isEnabled(masterKey?: string): boolean {
    return !!masterKey && masterKey.length >= 32;
  }
}
