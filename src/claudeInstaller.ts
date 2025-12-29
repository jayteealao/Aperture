import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type Platform = 'darwin' | 'linux' | 'win32';

/**
 * Detects the current platform
 */
export function detectPlatform(): Platform {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
    return platform;
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

/**
 * Checks if Claude Code CLI is installed
 */
export async function isClaudeInstalled(): Promise<boolean> {
  try {
    await execAsync('claude --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the path to the Claude Code CLI executable
 */
export async function getClaudePath(): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('which claude');
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Gets the installation command for the current platform
 */
export function getInstallCommand(platform: Platform): string {
  switch (platform) {
    case 'darwin':
    case 'linux':
      return 'curl -fsSL https://claude.ai/install.sh | bash';
    case 'win32':
      // PowerShell command
      return 'irm https://claude.ai/install.ps1 | iex';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Gets the shell to use for installation
 */
export function getInstallShell(platform: Platform): string {
  switch (platform) {
    case 'darwin':
    case 'linux':
      return 'bash';
    case 'win32':
      return 'powershell.exe';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Installs Claude Code CLI (requires user permission in production)
 * This is a helper function - you should prompt before calling it
 */
export async function installClaude(platform: Platform): Promise<void> {
  const command = getInstallCommand(platform);
  const shell = getInstallShell(platform);

  console.log(`Installing Claude Code CLI using: ${command}`);

  try {
    if (platform === 'win32') {
      await execAsync(command, { shell });
    } else {
      await execAsync(command, { shell });
    }
    console.log('Claude Code CLI installed successfully');
  } catch (err) {
    throw new Error(`Failed to install Claude Code CLI: ${(err as Error).message}`);
  }
}

/**
 * Verifies Claude Code CLI installation and returns the executable path
 * If not installed, returns undefined and logs a warning
 */
export async function verifyClaudeInstallation(): Promise<string | undefined> {
  const installed = await isClaudeInstalled();

  if (installed) {
    const path = await getClaudePath();
    console.log(`✓ Claude Code CLI found at: ${path || 'PATH'}`);
    return path;
  } else {
    console.warn('⚠️  Claude Code CLI not found');
    console.warn('⚠️  The adapter will attempt to use its vendored CLI');
    console.warn('⚠️  For best results, install Claude Code CLI:');
    const platform = detectPlatform();
    console.warn(`⚠️  Run: ${getInstallCommand(platform)}`);
    return undefined;
  }
}

/**
 * Checks readiness: verifies we can spawn processes and locate claude-code-acp
 */
export async function checkReadiness(): Promise<{
  ready: boolean;
  claudePath?: string;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check if we can spawn a basic process
  try {
    await execAsync('echo test');
  } catch (err) {
    errors.push(`Cannot spawn processes: ${(err as Error).message}`);
  }

  // Check if claude-code-acp is available (it should be installed via npm)
  try {
    await execAsync('which claude-code-acp || where claude-code-acp');
  } catch {
    errors.push('claude-code-acp not found in PATH (install @zed-industries/claude-code-acp)');
  }

  // Check if Claude CLI is available (optional but recommended)
  const claudePath = await verifyClaudeInstallation();

  return {
    ready: errors.length === 0,
    claudePath,
    errors,
  };
}
