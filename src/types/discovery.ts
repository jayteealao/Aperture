/**
 * Discovery types for repository scanning and cloning
 */

export interface DiscoveredRepo {
  path: string;
  name: string;
  remoteUrl?: string;
  hasOrigin: boolean;
}

export interface DiscoveryResult {
  repos: DiscoveredRepo[];
  scannedDirectories: number;
  errors: Array<{ path: string; error: string }>;
}

export interface CloneProgress {
  phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'done';
  current: number;
  total: number;
  percent: number;
}
