import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { discoverSlashPickerEntries } from '../slash-picker-discovery.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function writeFixture(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

describe('slash picker discovery', () => {
  it('normalizes SDK, project commands, and project skills without merging duplicates', async () => {
    const workspaceDir = await makeTempDir('aperture-slash-picker-workspace-');
    const claudeHome = await makeTempDir('aperture-slash-picker-claude-');

    await writeFixture(
      path.join(workspaceDir, '.claude', 'commands', 'security.md'),
      'Root security review'
    );
    await writeFixture(
      path.join(workspaceDir, '.claude', 'commands', 'review', 'security.md'),
      [
        '---',
        'description: Namespaced security review',
        'argument-hint: [path]',
        '---',
        'Review security for $ARGUMENTS',
      ].join('\n')
    );
    await writeFixture(
      path.join(workspaceDir, '.claude', 'skills', 'triage', 'SKILL.md'),
      ['---', 'name: Triage', 'description: Triage work', '---', '# Triage'].join('\n')
    );

    const result = await discoverSlashPickerEntries({
      workspaceDir,
      claudeHome,
      sdkCommands: [{ name: 'security', description: 'SDK security', argumentHint: '[target]' }],
    });

    const securityEntries = result.entries.filter((entry) => entry.name === 'security');
    expect(securityEntries).toHaveLength(3);
    expect(securityEntries.map((entry) => entry.source)).toEqual(['sdk', 'project', 'project']);
    expect(securityEntries.map((entry) => entry.token)).toEqual(['/security', '/security', '/security']);
    expect(securityEntries.find((entry) => entry.namespace === 'review')?.argumentHint).toBe('[path]');
    expect(result.entries).toContainEqual(
      expect.objectContaining({
        name: 'Triage',
        token: '/triage',
        type: 'skill',
        source: 'project',
      })
    );
    expect(result.sourceStatuses.find((status) => status.source === 'project')?.status).toBe('ready');
  });

  it('keeps usable project entries when frontmatter is malformed', async () => {
    const workspaceDir = await makeTempDir('aperture-slash-picker-workspace-');
    const claudeHome = await makeTempDir('aperture-slash-picker-claude-');

    await writeFixture(
      path.join(workspaceDir, '.claude', 'commands', 'bad.md'),
      ['---', 'description: "unterminated', '---', 'Still usable'].join('\n')
    );
    await writeFixture(
      path.join(workspaceDir, '.claude', 'commands', 'good.md'),
      'Good command'
    );

    const result = await discoverSlashPickerEntries({
      workspaceDir,
      claudeHome,
      sdkCommands: [],
    });

    expect(result.entries.map((entry) => entry.token)).toEqual(['/bad', '/good']);
    expect(result.sourceStatuses.find((status) => status.source === 'project')).toEqual(
      expect.objectContaining({
        source: 'project',
        status: 'partial',
      })
    );
  });

  it('discovers only enabled installed plugin commands and skills from active install paths', async () => {
    const workspaceDir = await makeTempDir('aperture-slash-picker-workspace-');
    const claudeHome = await makeTempDir('aperture-slash-picker-claude-');
    const activeOld = path.join(claudeHome, 'plugins', 'cache', 'market', 'active', '1.0.0');
    const activeNew = path.join(claudeHome, 'plugins', 'cache', 'market', 'active', '2.0.0');
    const inactive = path.join(claudeHome, 'plugins', 'cache', 'market', 'inactive', '1.0.0');

    await writeFixture(
      path.join(claudeHome, 'settings.json'),
      JSON.stringify({
        enabledPlugins: {
          'active@market': true,
          'inactive@market': false,
        },
      })
    );
    await writeFixture(
      path.join(claudeHome, 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'active@market': [
            {
              scope: 'user',
              installPath: activeOld,
              version: '1.0.0',
              lastUpdated: '2026-01-01T00:00:00.000Z',
            },
            {
              scope: 'user',
              installPath: activeNew,
              version: '2.0.0',
              lastUpdated: '2026-04-01T00:00:00.000Z',
            },
          ],
          'inactive@market': [
            {
              scope: 'user',
              installPath: inactive,
              version: '1.0.0',
              lastUpdated: '2026-04-01T00:00:00.000Z',
            },
          ],
        },
      })
    );

    await writeFixture(path.join(activeOld, 'commands', 'stale.md'), 'Stale command');
    await writeFixture(
      path.join(activeNew, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'active-plugin' })
    );
    await writeFixture(path.join(activeNew, 'commands', 'run.md'), 'Run command');
    await writeFixture(
      path.join(activeNew, 'skills', 'ship', 'SKILL.md'),
      ['---', 'description: Ship work', '---', '# Ship'].join('\n')
    );
    await writeFixture(path.join(inactive, 'commands', 'hidden.md'), 'Hidden command');

    const result = await discoverSlashPickerEntries({
      workspaceDir,
      claudeHome,
      sdkCommands: [],
    });

    const tokens = result.entries.map((entry) => entry.token);
    expect(tokens).toContain('/active-plugin:run');
    expect(tokens).toContain('/active-plugin:ship');
    expect(tokens).not.toContain('/active-plugin:stale');
    expect(tokens).not.toContain('/inactive:hidden');
    expect(result.entries.every((entry) => entry.source !== 'global' || entry.origin?.pluginId === 'active@market')).toBe(true);
  });

  it('reports SDK failures without blocking project entries', async () => {
    const workspaceDir = await makeTempDir('aperture-slash-picker-workspace-');
    const claudeHome = await makeTempDir('aperture-slash-picker-claude-');
    await writeFixture(path.join(workspaceDir, '.claude', 'commands', 'local.md'), 'Local command');

    const result = await discoverSlashPickerEntries({
      workspaceDir,
      claudeHome,
      sdkError: 'No active query - send a prompt first',
    });

    expect(result.entries).toContainEqual(
      expect.objectContaining({
        token: '/local',
        source: 'project',
      })
    );
    expect(result.sourceStatuses.find((status) => status.source === 'sdk')).toEqual(
      expect.objectContaining({
        status: 'failed',
        message: 'No active query - send a prompt first',
      })
    );
  });
});
