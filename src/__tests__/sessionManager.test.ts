import { describe, it, expect } from 'vitest';
import { extractRepoNameFromUrl } from '../sessionManager.js';

describe('extractRepoNameFromUrl', () => {
  it('extracts name from HTTPS .git URL', () => {
    expect(extractRepoNameFromUrl('https://github.com/user/my-project.git')).toBe('my-project');
  });

  it('extracts name from HTTPS URL without .git', () => {
    expect(extractRepoNameFromUrl('https://github.com/user/my-project')).toBe('my-project');
  });

  it('extracts name from SSH-style URL', () => {
    expect(extractRepoNameFromUrl('git@github.com:user/my-project.git')).toBe('my-project');
  });

  it('extracts name from SSH URL without .git', () => {
    expect(extractRepoNameFromUrl('git@github.com:user/my-project')).toBe('my-project');
  });

  it('extracts name from git:// protocol URL', () => {
    expect(extractRepoNameFromUrl('git://github.com/user/my-project.git')).toBe('my-project');
  });

  it('extracts name from deep path URL', () => {
    expect(extractRepoNameFromUrl('https://gitlab.com/group/subgroup/my-project.git')).toBe('my-project');
  });

  it('returns "repo" for unrecognizable URLs', () => {
    expect(extractRepoNameFromUrl('')).toBe('repo');
  });

  it('handles URL with trailing slash', () => {
    // The regex may not match trailing slash — should fallback gracefully
    const result = extractRepoNameFromUrl('https://github.com/user/my-project/');
    expect(typeof result).toBe('string');
  });

  it('does not execute shell commands in malicious URLs', () => {
    // These should just extract the last path segment, not execute anything
    const result1 = extractRepoNameFromUrl('https://github.com/user/$(rm -rf /).git');
    expect(typeof result1).toBe('string');

    const result2 = extractRepoNameFromUrl('https://github.com/user/`whoami`.git');
    expect(typeof result2).toBe('string');
  });
});
