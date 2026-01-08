import { resolve, isAbsolute } from 'path';
import { access } from 'fs/promises';

/**
 * Validate and normalize a path
 * @throws Error if path is invalid
 */
export function validatePath(inputPath: string): string {
  // Must be absolute
  if (!isAbsolute(inputPath)) {
    throw new Error(`Path must be absolute: ${inputPath}`);
  }

  // Normalize (handles .. and Windows path separators)
  const normalized = resolve(inputPath);

  // On Windows, verify it starts with a drive letter
  if (process.platform === 'win32') {
    if (!/^[a-zA-Z]:/.test(normalized)) {
      throw new Error(`Invalid Windows path: ${inputPath}`);
    }
  }

  return normalized;
}

/**
 * Validate that a path exists and is accessible
 * @throws Error if path doesn't exist or isn't accessible
 */
export async function validatePathExists(inputPath: string): Promise<string> {
  const normalized = validatePath(inputPath);
  await access(normalized); // Throws if not accessible
  return normalized;
}
