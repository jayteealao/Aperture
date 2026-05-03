import { readdir, readFile, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import type {
  SlashCommand,
  SlashPickerEntriesResponse,
  SlashPickerEntry,
  SlashPickerEntrySource,
  SlashPickerSourceStatus,
} from './agents/sdk-types.js';

interface DiscoverSlashPickerEntriesOptions {
  workspaceDir?: string;
  sdkCommands?: SlashCommand[];
  sdkError?: string;
  claudeHome?: string;
}

interface ParsedMarkdown {
  data: Record<string, unknown>;
  content: string;
  malformed: boolean;
}

interface PluginInstall {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
}

interface InstalledPluginsFile {
  plugins?: Record<string, PluginInstall[]>;
}

const PROJECT_COMMANDS_DIR = ['.claude', 'commands'];
const PROJECT_SKILLS_DIR = ['.claude', 'skills'];
const PLUGIN_SKILL_DIRS = [
  ['skills'],
  ['.claude', 'skills'],
  ['.agents', 'skills'],
];

export async function discoverSlashPickerEntries(
  options: DiscoverSlashPickerEntriesOptions
): Promise<SlashPickerEntriesResponse> {
  const statuses: SlashPickerSourceStatus[] = [];
  const entries: SlashPickerEntry[] = [];

  const sdkEntries = normalizeSdkCommands(options.sdkCommands ?? []);
  entries.push(...sdkEntries);
  statuses.push(sourceStatus('sdk', sdkEntries.length, options.sdkError));

  const projectResult = await collectSource('project', async () => {
    if (!options.workspaceDir) {
      return {
        entries: [],
        warnings: ['Session has no working directory'],
        unavailable: true,
      };
    }
    const [commands, skills] = await Promise.all([
      discoverProjectCommands(options.workspaceDir),
      discoverProjectSkills(options.workspaceDir),
    ]);
    return {
      entries: [...commands.entries, ...skills.entries],
      warnings: [...commands.warnings, ...skills.warnings],
    };
  });
  entries.push(...projectResult.entries);
  statuses.push(projectResult.status);

  const globalResult = await collectSource('global', async () => {
    return discoverGlobalPluginEntries(options.claudeHome ?? path.join(os.homedir(), '.claude'));
  });
  entries.push(...globalResult.entries);
  statuses.push(globalResult.status);

  return {
    entries: sortEntries(entries),
    sourceStatuses: statuses,
  };
}

function sourceStatus(
  source: SlashPickerEntrySource,
  count: number,
  error?: string
): SlashPickerSourceStatus {
  if (error) {
    return {
      source,
      status: count > 0 ? 'partial' : 'failed',
      message: error,
    };
  }

  return {
    source,
    status: count > 0 ? 'ready' : 'empty',
  };
}

async function collectSource(
  source: SlashPickerEntrySource,
  load: () => Promise<{ entries: SlashPickerEntry[]; warnings?: string[]; unavailable?: boolean }>
): Promise<{ entries: SlashPickerEntry[]; status: SlashPickerSourceStatus }> {
  try {
    const result = await load();
    const warnings = result.warnings ?? [];
    if (result.unavailable) {
      return {
        entries: result.entries,
        status: {
          source,
          status: 'unavailable',
          message: warnings[0],
        },
      };
    }
    if (warnings.length > 0) {
      return {
        entries: result.entries,
        status: {
          source,
          status: result.entries.length > 0 ? 'partial' : 'failed',
          message: warnings.join('; '),
        },
      };
    }
    return {
      entries: result.entries,
      status: {
        source,
        status: result.entries.length > 0 ? 'ready' : 'empty',
      },
    };
  } catch (error) {
    return {
      entries: [],
      status: {
        source,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function normalizeSdkCommands(commands: SlashCommand[]): SlashPickerEntry[] {
  return commands.map((command) => {
    const name = normalizeName(command.name);
    return {
      id: `sdk:command:${name}`,
      token: ensureSlashToken(name),
      name,
      type: 'command',
      source: 'sdk',
      sourceLabel: 'SDK',
      description: command.description || undefined,
      argumentHint: command.argumentHint || undefined,
    };
  });
}

async function discoverProjectCommands(
  workspaceDir: string
): Promise<{ entries: SlashPickerEntry[]; warnings: string[] }> {
  const root = path.join(workspaceDir, ...PROJECT_COMMANDS_DIR);
  const files = await listMarkdownFiles(root);
  const warnings: string[] = [];
  const entries: SlashPickerEntry[] = [];

  for (const file of files) {
    const parsed = await parseMarkdownFile(file);
    if (!parsed) {
      warnings.push(`Could not read ${toRelativePath(workspaceDir, file)}`);
      continue;
    }
    if (parsed.malformed) {
      warnings.push(`Malformed frontmatter in ${toRelativePath(workspaceDir, file)}`);
    }

    const relativePath = toRelativePath(root, file);
    const namespace = normalizeNamespace(path.dirname(relativePath));
    const name = path.basename(file, path.extname(file));
    entries.push({
      id: `project:command:${relativePath.replace(/\\/g, '/')}`,
      token: ensureSlashToken(name),
      name,
      type: 'command',
      source: 'project',
      sourceLabel: namespace ? `Project:${namespace}` : 'Project',
      description: readFrontmatterString(parsed.data, 'description') ?? firstContentLine(parsed.content),
      argumentHint: readFrontmatterString(parsed.data, 'argument-hint'),
      namespace,
      origin: {
        path: relativePath.replace(/\\/g, '/'),
      },
    });
  }

  return { entries, warnings };
}

async function discoverProjectSkills(
  workspaceDir: string
): Promise<{ entries: SlashPickerEntry[]; warnings: string[] }> {
  const root = path.join(workspaceDir, ...PROJECT_SKILLS_DIR);
  return discoverSkillDirectory({
    root,
    source: 'project',
    sourceLabel: 'Project',
    idPrefix: 'project',
    tokenNamespace: undefined,
    originRoot: root,
  });
}

async function discoverGlobalPluginEntries(
  claudeHome: string
): Promise<{ entries: SlashPickerEntry[]; warnings: string[] }> {
  const warnings: string[] = [];
  const enabledPlugins = await readEnabledPluginIds(path.join(claudeHome, 'settings.json'), warnings);
  const installedPlugins = await readInstalledPlugins(path.join(claudeHome, 'plugins', 'installed_plugins.json'), warnings);
  const entries: SlashPickerEntry[] = [];

  for (const pluginId of enabledPlugins) {
    const install = choosePluginInstall(installedPlugins[pluginId]);
    if (!install?.installPath) {
      warnings.push(`Enabled plugin ${pluginId} is not installed`);
      continue;
    }

    const pluginName = await readPluginName(install.installPath, pluginId);
    const tokenNamespace = normalizePluginNamespace(pluginName || pluginId);
    const pluginEntries = await discoverPluginEntries(pluginId, pluginName, install.installPath, tokenNamespace);
    entries.push(...pluginEntries.entries);
    warnings.push(...pluginEntries.warnings);
  }

  return { entries, warnings };
}

async function discoverPluginEntries(
  pluginId: string,
  pluginName: string,
  installPath: string,
  tokenNamespace: string
): Promise<{ entries: SlashPickerEntry[]; warnings: string[] }> {
  const warnings: string[] = [];
  const entries: SlashPickerEntry[] = [];
  const commandFiles = await listMarkdownFiles(path.join(installPath, 'commands'));

  for (const file of commandFiles) {
    const parsed = await parseMarkdownFile(file);
    if (!parsed) {
      warnings.push(`Could not read command for plugin ${pluginId}`);
      continue;
    }
    if (parsed.malformed) {
      warnings.push(`Malformed command frontmatter in plugin ${pluginId}`);
    }
    const relativePath = toRelativePath(installPath, file);
    const name = path.basename(file, path.extname(file));
    entries.push({
      id: `global:${pluginId}:command:${relativePath.replace(/\\/g, '/')}`,
      token: `/${tokenNamespace}:${name}`,
      name,
      type: 'command',
      source: 'global',
      sourceLabel: `Global:${pluginName}`,
      description: readFrontmatterString(parsed.data, 'description') ?? firstContentLine(parsed.content),
      argumentHint: readFrontmatterString(parsed.data, 'argument-hint'),
      namespace: tokenNamespace,
      origin: {
        pluginId,
        pluginName,
        path: relativePath.replace(/\\/g, '/'),
      },
    });
  }

  for (const skillDir of PLUGIN_SKILL_DIRS) {
    const skillResult = await discoverSkillDirectory({
      root: path.join(installPath, ...skillDir),
      source: 'global',
      sourceLabel: `Global:${pluginName}`,
      idPrefix: `global:${pluginId}:${skillDir.join('/')}`,
      tokenNamespace,
      originRoot: installPath,
      pluginId,
      pluginName,
    });
    entries.push(...skillResult.entries);
    warnings.push(...skillResult.warnings);
  }

  return { entries, warnings };
}

async function discoverSkillDirectory(options: {
  root: string;
  source: SlashPickerEntrySource;
  sourceLabel: string;
  idPrefix: string;
  tokenNamespace?: string;
  originRoot: string;
  pluginId?: string;
  pluginName?: string;
}): Promise<{ entries: SlashPickerEntry[]; warnings: string[] }> {
  const skillFiles = await listSkillFiles(options.root);
  const warnings: string[] = [];
  const entries: SlashPickerEntry[] = [];

  for (const file of skillFiles) {
    const parsed = await parseMarkdownFile(file);
    if (!parsed) {
      warnings.push(`Could not read ${toRelativePath(options.originRoot, file)}`);
      continue;
    }
    if (parsed.malformed) {
      warnings.push(`Malformed frontmatter in ${toRelativePath(options.originRoot, file)}`);
    }

    const relativePath = toRelativePath(options.originRoot, file).replace(/\\/g, '/');
    const fallbackName = path.basename(path.dirname(file));
    const name = readFrontmatterString(parsed.data, 'name') ?? fallbackName;
    const tokenName = normalizeName(readFrontmatterString(parsed.data, 'token') ?? fallbackName);
    const token = options.tokenNamespace
      ? `/${options.tokenNamespace}:${tokenName}`
      : ensureSlashToken(tokenName);

    entries.push({
      id: `${options.idPrefix}:skill:${relativePath}`,
      token,
      name,
      type: 'skill',
      source: options.source,
      sourceLabel: options.sourceLabel,
      description: readFrontmatterString(parsed.data, 'description') ?? firstContentLine(parsed.content),
      argumentHint: readFrontmatterString(parsed.data, 'argument-hint'),
      namespace: options.tokenNamespace,
      origin: {
        path: relativePath,
        ...(options.pluginId ? { pluginId: options.pluginId } : {}),
        ...(options.pluginName ? { pluginName: options.pluginName } : {}),
      },
    });
  }

  return { entries, warnings };
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return [];
  const files: string[] = [];
  await walk(root, async (file) => {
    if (file.toLowerCase().endsWith('.md')) {
      files.push(file);
    }
  });
  return files.sort((a, b) => a.localeCompare(b));
}

async function listSkillFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(root, entry.name, 'SKILL.md');
    if (await pathExists(skillFile)) {
      files.push(skillFile);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function walk(root: string, visit: (file: string) => Promise<void>): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, visit);
    } else if (entry.isFile()) {
      await visit(fullPath);
    }
  }
}

async function parseMarkdownFile(file: string): Promise<ParsedMarkdown | null> {
  try {
    const raw = await readFile(file, 'utf8');
    try {
      const parsed = matter(raw);
      return {
        data: parsed.data as Record<string, unknown>,
        content: parsed.content,
        malformed: false,
      };
    } catch {
      return {
        data: {},
        content: stripFrontmatter(raw),
        malformed: true,
      };
    }
  } catch {
    return null;
  }
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const closing = raw.indexOf('\n---', 3);
  return closing === -1 ? raw : raw.slice(closing + 4);
}

async function readEnabledPluginIds(settingsPath: string, warnings: string[]): Promise<string[]> {
  const settings = await readJsonFile<{ enabledPlugins?: Record<string, boolean> }>(settingsPath);
  if (!settings) {
    warnings.push('Claude settings not found');
    return [];
  }
  return Object.entries(settings.enabledPlugins ?? {})
    .filter(([, enabled]) => enabled)
    .map(([pluginId]) => pluginId)
    .sort((a, b) => a.localeCompare(b));
}

async function readInstalledPlugins(
  installedPluginsPath: string,
  warnings: string[]
): Promise<Record<string, PluginInstall[]>> {
  const installed = await readJsonFile<InstalledPluginsFile>(installedPluginsPath);
  if (!installed?.plugins) {
    warnings.push('Claude installed plugin metadata not found');
    return {};
  }
  return installed.plugins;
}

function choosePluginInstall(installs?: PluginInstall[]): PluginInstall | undefined {
  if (!installs || installs.length === 0) return undefined;
  return [...installs].sort((a, b) => {
    const bTime = Date.parse(b.lastUpdated ?? b.installedAt ?? '');
    const aTime = Date.parse(a.lastUpdated ?? a.installedAt ?? '');
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  })[0];
}

async function readPluginName(installPath: string, pluginId: string): Promise<string> {
  const pluginJson = await readJsonFile<{ name?: string }>(path.join(installPath, '.claude-plugin', 'plugin.json'));
  return normalizePluginNamespace(pluginJson?.name ?? pluginId);
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function readFrontmatterString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (typeof value === 'string') {
    return value.trim() ? value.trim() : undefined;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return `[${value.join(' ')}]`;
  }
  return undefined;
}

function firstContentLine(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function ensureSlashToken(name: string): string {
  return name.startsWith('/') ? name : `/${name}`;
}

function normalizeName(name: string): string {
  return name.trim().replace(/^\//, '');
}

function normalizeNamespace(namespace: string): string | undefined {
  if (!namespace || namespace === '.') return undefined;
  return namespace.replace(/\\/g, '/');
}

function normalizePluginNamespace(value: string): string {
  return value.split('@')[0].trim().replace(/^\//, '');
}

function toRelativePath(root: string, file: string): string {
  return path.relative(root, file) || path.basename(file);
}

function sortEntries(entries: SlashPickerEntry[]): SlashPickerEntry[] {
  const sourceOrder: Record<SlashPickerEntrySource, number> = {
    sdk: 0,
    project: 1,
    global: 2,
  };
  return [...entries].sort((a, b) => {
    const sourceDelta = sourceOrder[a.source] - sourceOrder[b.source];
    if (sourceDelta !== 0) return sourceDelta;
    return a.token.localeCompare(b.token) || a.id.localeCompare(b.id);
  });
}
