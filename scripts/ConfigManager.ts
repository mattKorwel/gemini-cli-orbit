/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { 
    type OrbitConfig, 
    type OrbitSettings,
    DEFAULT_REPO_NAME,
    DEFAULT_TEMP_DIR,
    GLOBAL_SETTINGS_PATH,
    PROJECT_CONFIG_PATH,
    PROJECT_ORBIT_DIR,
    PROFILES_DIR
} from './Constants.js';

const REPO_ROOT = process.cwd();

/**
 * Sanitizes a name (profile, station, repo) to prevent path traversal.
 */
export function sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9\-_]/g, '');
}

/**
 * Detects the current repository name using gh cli.
 */
export function detectRepoName(): string {
    const res = spawnSync('gh', ['repo', 'view', '--json', 'name'], { stdio: 'pipe' });
    if (res.status === 0) {
        try {
            return JSON.parse(res.stdout.toString()).name;
        } catch {}
    }
    return path.basename(REPO_ROOT) || DEFAULT_REPO_NAME || 'gemini-cli';
}

/**
 * Loads settings from a specific path.
 */
function loadJson(p: string): any {
    if (fs.existsSync(p)) {
        try {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch (e) {
            console.error(`⚠️ Failed to parse ${p}:`, e);
        }
    }
    return {};
}

/**
 * Loads the global orbit settings.
 */
export function loadGlobalSettings(): OrbitSettings {
    const data = loadJson(GLOBAL_SETTINGS_PATH);
    if (!data.repos) return { repos: {}, ...data };
    return data;
}

/**
 * Loads the project-wide defaults.
 */
export function loadProjectConfig(): OrbitConfig {
    return loadJson(PROJECT_CONFIG_PATH);
}

/**
 * Fetches a GitHub repository variable using gh cli.
 */
function getGhVariable(name: string): string | undefined {
    const res = spawnSync('gh', ['variable', 'get', name], { stdio: 'pipe' });
    if (res.status === 0) {
        return res.stdout.toString().trim();
    }
    return undefined;
}

/**
 * Resolves the final configuration for a repository by merging all layers.
 */
export function getRepoConfig(repoName?: string): OrbitConfig {
    const targetRepo = repoName || detectRepoName();
    const globalSettings = loadGlobalSettings();
    const projectConfig = loadProjectConfig();

    // 1. Start with Project Defaults (TRACKED)
    let config: OrbitConfig = { ...projectConfig };

    // 2. Merge Global General Defaults
    const { repos: _, activeRepo: __, activeProfile: ___, ...globalDefaults } = globalSettings;
    config = { ...config, ...globalDefaults };

    // 3. Merge GitHub Team Config (Shared variables)
    const ghConfig: OrbitConfig = {};
    const projectId = getGhVariable('GCLI_PROJECT_ID');
    if (projectId) ghConfig.projectId = projectId;
    const zone = getGhVariable('GCLI_ZONE');
    if (zone) ghConfig.zone = zone;
    const vpcName = getGhVariable('GCLI_VPC_NAME');
    if (vpcName) ghConfig.vpcName = vpcName;
    const subnetName = getGhVariable('GCLI_SUBNET_NAME');
    if (subnetName) ghConfig.subnetName = subnetName;
    const dnsSuffix = getGhVariable('GCLI_DNS_SUFFIX');
    if (dnsSuffix) ghConfig.dnsSuffix = dnsSuffix;
    const userSuffix = getGhVariable('GCLI_USER_SUFFIX');
    if (userSuffix) ghConfig.userSuffix = userSuffix;

    config = { ...config, ...ghConfig };

    // 4. Resolve Profile
    const profileName = globalSettings.repos?.[targetRepo]?.profile || 
                      globalSettings.activeProfile ||
                      projectConfig.profile;

    if (profileName) {
        const profilePath = path.join(PROFILES_DIR, profileName.endsWith('.json') ? profileName : `${profileName}.json`);
        const profileData = loadJson(profilePath);
        config = { ...config, ...profileData };
    }

    // 5. Merge Global Repo Registry (User's project settings)
    if (globalSettings.repos?.[targetRepo]) {
        config = { ...config, ...globalSettings.repos[targetRepo] };
    }

    // 6. Merge Environment Variables (Highest Priority)
    const envConfig: OrbitConfig = {};
    if (process.env.GCLI_ORBIT_PROJECT_ID) envConfig.projectId = process.env.GCLI_ORBIT_PROJECT_ID;
    if (process.env.GCLI_ORBIT_ZONE) envConfig.zone = process.env.GCLI_ORBIT_ZONE;
    if (process.env.GCLI_ORBIT_INSTANCE_NAME) envConfig.instanceName = process.env.GCLI_ORBIT_INSTANCE_NAME;
    if (process.env.GCLI_ORBIT_BACKEND) envConfig.backendType = process.env.GCLI_ORBIT_BACKEND as any;
    if (process.env.GCLI_ORBIT_IMAGE) envConfig.imageUri = process.env.GCLI_ORBIT_IMAGE;
    if (process.env.GCLI_ORBIT_TEMP_DIR) envConfig.tempDir = process.env.GCLI_ORBIT_TEMP_DIR;
    if (process.env.GCLI_ORBIT_AUTO_CLEAN) envConfig.autoClean = process.env.GCLI_ORBIT_AUTO_CLEAN === 'true';
    if (process.env.GCLI_ORBIT_CPU_LIMIT) envConfig.cpuLimit = process.env.GCLI_ORBIT_CPU_LIMIT;
    if (process.env.GCLI_ORBIT_MEMORY_LIMIT) envConfig.memoryLimit = process.env.GCLI_ORBIT_MEMORY_LIMIT;
    
    config = { ...config, ...envConfig };

    // Ensure repoName is set
    config.repoName = targetRepo;

    return config;
}

/**
 * Legacy support for loadSettings (Migration helper)
 */
export function loadSettings(): OrbitSettings {
    const global = loadGlobalSettings();
    if (Object.keys(global.repos).length > 0) return global;
    
    // Check if we have an old project-local one to migrate
    const projectLocalPath = path.join(PROJECT_ORBIT_DIR, 'settings.json');
    if (fs.existsSync(projectLocalPath)) {
        const local = loadJson(projectLocalPath);
        if (local.orbit) return { repos: { [detectRepoName()]: local.orbit } };
        if (local.repos) return local;
    }
    return { repos: {} };
}
