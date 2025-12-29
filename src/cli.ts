import { spawn, SpawnOptions } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { config } from './config';

export class CliManager {
  private static instance: CliManager;
  private resolvedExecutable: string | undefined;

  private constructor() {
    this.resolvedExecutable = config.CLAUDE_CODE_EXECUTABLE;
  }

  static getInstance(): CliManager {
    if (!CliManager.instance) {
      CliManager.instance = new CliManager();
    }
    return CliManager.instance;
  }

  async ensureClaudeCodeInstalled(): Promise<void> {
    // If explicitly configured, trust it
    if (config.CLAUDE_CODE_EXECUTABLE) {
      this.resolvedExecutable = config.CLAUDE_CODE_EXECUTABLE;
      // We could verify it exists/runs here, but the prompt says "Check if Claude Code CLI is already installed: run claude --version"
    }

    // Check if installed
    if (await this.checkInstalled()) {
      console.log('✅ Claude Code CLI is already installed.');
      if (!this.resolvedExecutable) {
         // If we found it via `claude` command but didn't have a path,
         // we might want to resolve the path or just let it use 'claude'.
         // The prompt says: "When spawning claude-code-acp, set CLAUDE_CODE_EXECUTABLE to the resolved claude path IF you have it; otherwise leave unset."
         // For now, if checkInstalled passes, we assume 'claude' is in PATH.
         // We can try to resolve it using `which` or similar if we want to be explicit,
         // but leaving it unset if it's in PATH is also fine for the *child* process
         // if the child process (claude-code-acp) uses `claude` from PATH.
         // However, prompt says "The adapter can use a vendored Claude Code CLI... but supports overriding... via CLAUDE_CODE_EXECUTABLE".
         // So it's better if we find the path and set it.
         this.resolvedExecutable = await this.resolvePath('claude');
      }
      return;
    }

    console.log('⚠️ Claude Code CLI not found. Attempting installation...');
    try {
      await this.install();
      console.log('✅ Installation successful.');

      // Re-check
      if (await this.checkInstalled()) {
         this.resolvedExecutable = await this.resolvePath('claude');
      } else {
         console.warn('⚠️ Installed but still not found in PATH.');
      }
    } catch (error) {
      console.error('❌ Installation failed:', error);
      // "If still not present, DO NOT fail the whole app: proceed anyway; claude-code-acp may still run using its vendored CLI."
    }
  }

  getExecutablePath(): string | undefined {
    return this.resolvedExecutable;
  }

  private async checkInstalled(): Promise<boolean> {
    try {
      // Try running 'claude --version'
      // Use the resolved executable if we have one, otherwise 'claude'
      const cmd = this.resolvedExecutable || 'claude';
      await this.runCommand(cmd, ['--version']);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async install(): Promise<void> {
    const platform = os.platform();
    let installCmd = '';
    let shell = '';
    let args: string[] = [];

    if (platform === 'win32') {
      // Windows PowerShell: irm https://claude.ai/install.ps1 | iex
      // We'll use PowerShell
      shell = 'powershell.exe';
      installCmd = 'irm https://claude.ai/install.ps1 | iex';
      args = ['-NoProfile', '-InputFormat', 'None', '-ExecutionPolicy', 'Bypass', '-Command', installCmd];
    } else if (platform === 'linux' || platform === 'darwin') {
      // macOS/Linux: curl -fsSL https://claude.ai/install.sh | bash
      shell = 'bash';
      installCmd = 'curl -fsSL https://claude.ai/install.sh | bash';
      args = ['-lc', installCmd];
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`Running install command on ${platform}: ${shell} ${args.join(' ')}`);
    await this.runCommand(shell, args, { stdio: 'inherit' });
  }

  private runCommand(command: string, args: string[], options: SpawnOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { ...options, shell: false }); // shell: false because we invoke shell explicitly above or command directly

      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command failed with code ${code}`));
      });

      // If we are checking version (stdio not inherited), consume streams to avoid hanging?
      // spawn with stdio: 'pipe' (default) needs streams consumed.
      if (!options.stdio) {
          child.stdout?.on('data', () => {});
          child.stderr?.on('data', () => {});
      }
    });
  }

  private async resolvePath(command: string): Promise<string | undefined> {
     // simple `which` implementation or use `which` package
     try {
       const which = (await import('which')).default;
       return await which(command);
     } catch (e) {
       return undefined;
     }
  }
}
