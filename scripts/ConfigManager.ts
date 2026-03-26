/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { 
    type WorkspaceConfig, 
    type WorkspaceSettings,
    DEFAULT_REPO_NAME
} from './Constants.ts';

const REPO_ROOT = process.cwd();
const SETTINGS_PATH = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');

/**
 * Detects the current repository name using gh cli.
 */
export function detectRepoName(): string {
    const res = spawnSync('gh', ['repo', 'view', '--json', 'name'], { stdio: 'pipe' });
    if (res.status === 0) {
        try {
            return JSON.parse(res.stdout.toString()).name;
        } catch (e) {}
    }
    return DEFAULT_REPO_NAME || 'gemini-cli';
}

/**
 * Loads the workspace settings and handles migration.
 */
export function loadSettings(): WorkspaceSettings {
    let settings: WorkspaceSettings = { repos: {} };
    
    if (fs.existsSync(SETTINGS_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            if (data.repos) {
                settings = data;
            } else if (data.workspace) {
                // Migration
                const legacyConfig = data.workspace as WorkspaceConfig;
                const repoName = legacyConfig.repoName || detectRepoName() || 'legacy-repo';
                const instanceName = legacyConfig.instanceName || `gcli-workspace-${process.env.USER || 'gcli-user'}`;
                
                settings.repos = { [repoName]: { ...legacyConfig, repoName, instanceName } };
                settings.activeRepo = repoName;
                
                // Save migrated version
                fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
            }
        } catch (e) {
            console.error('⚠️ Failed to parse settings.json:', e);
        }
    }
    return settings;
}

/**
 * Gets the configuration for a specific repo or the active repo.
 */
export function getRepoConfig(repoName?: string): WorkspaceConfig | undefined {
    const settings = loadSettings();
    const targetRepo = repoName || detectRepoName() || settings.activeRepo;
    
    if (!targetRepo) return undefined;
    
    return settings.repos[targetRepo];
}
