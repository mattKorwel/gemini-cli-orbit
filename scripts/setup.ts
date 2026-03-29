/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import readline from 'node:readline';
import { logger } from './Logger.js';
import { ProviderFactory } from './providers/ProviderFactory.js';
import { 
  loadGlobalSettings, 
  getRepoConfig, 
  detectRepoName,
  sanitizeName
} from './ConfigManager.js';
import { fileURLToPath } from 'node:url';
import { 
  ORBIT_ROOT, 
  MAIN_REPO_PATH, 
  SATELLITE_WORKTREES_PATH, 
  POLICIES_PATH, 
  SCRIPTS_PATH, 
  CONFIG_DIR,
  EXTENSION_REMOTE_PATH,
  PROFILES_DIR,
  GLOBAL_SETTINGS_PATH,
  GLOBAL_TOKENS_DIR,
  UPSTREAM_ORG,
  DEFAULT_REPO_NAME,
  DEFAULT_IMAGE_URI,
  DEFAULT_TEMP_DIR,
  type OrbitConfig,
} from './Constants.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file.
 */
function loadDotEnv() {
  const envPaths = [path.join(REPO_ROOT, '.env'), path.join(os.homedir(), '.env')];
  envPaths.forEach(envPath => {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1]!.trim();
          const val = match[2]!.trim().replace(/^["'](.*)["']$/, '$1');
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  });
}

/**
 * Modern Clarity Prompt: Handles flags, auto-accept, and interactive input.
 */
async function prompt(question: string, defaultValue: string, interactive: boolean = true, explanation?: string, sensitive: boolean = false): Promise<string> {
  const args = process.argv.slice(2);
  const flagName = question.toLowerCase().replace(/\s+/g, '-');
  const flagOverride = args.find(a => a.startsWith(`--${flagName}=`))?.split('=')[1];
  
  if (flagOverride !== undefined) {
      logger.debug('PROMPT', `Using flag override for ${question}: ${sensitive ? '****' : flagOverride}`);
      return flagOverride;
  }

  const autoAccept = args.includes('--yes') || args.includes('-y');
  if (!interactive || autoAccept) return defaultValue;

  if (explanation) logger.info('SETUP', `\n📖 ${explanation}`);

  const displayDefault = sensitive && defaultValue ? `${defaultValue.substring(0, 4)}...${defaultValue.substring(defaultValue.length - 4)}` : defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const promptMsg = defaultValue ? `❓ ${question} [${displayDefault}]: ` : `❓ ${question}: `;

  return new Promise((resolve) => {
    rl.question(promptMsg, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Modern Clarity Confirm: Handles auto-accept via flags or non-interactive mode.
 */
async function confirm(question: string, defaultValue: boolean = true, interactive: boolean = true): Promise<boolean> {
  const args = process.argv.slice(2);
  const autoAccept = args.includes('--yes') || args.includes('-y') || !interactive;
  if (autoAccept) return defaultValue;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const promptMsg = `❓ ${question} (${defaultValue ? 'Y/n' : 'y/N'}): `;
    rl.question(promptMsg, (answer) => {
      rl.close();
      resolve(!answer.trim() ? defaultValue : answer.trim().toLowerCase() === 'y');
    });
  });
}

async function createFork(upstream: string): Promise<string> {
    logger.info('SETUP', `   - Creating fork for ${upstream}...`);
    const forkRes = spawnSync('gh', ['repo', 'fork', upstream, '--clone=false'], { stdio: 'inherit' });
    logger.logOutput(forkRes.stdout, forkRes.stderr);
    if (forkRes.status === 0) {
        const userRes = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' });
        const user = userRes.stdout.toString().trim();
        return `${user}/${upstream.split('/')[1]}`;
    }
    return upstream;
}

/**
 * MODE: Design Management
 * Manages global infrastructure templates (formerly Profiles).
 */
async function runDesignMode(name?: string): Promise<OrbitConfig> {
    logger.divider('ORBIT DESIGN CONFIGURATION');
    const rawDesignName = name || await prompt('Design Name', 'default');
    const designName = sanitizeName(rawDesignName);
    const designPath = path.join(PROFILES_DIR, `${designName.toLowerCase()}.json`);
    
    let existing: Partial<OrbitConfig> = {};
    if (fs.existsSync(designPath)) {
        logger.info('SETUP', `Editing existing design: ${designName}`);
        existing = JSON.parse(fs.readFileSync(designPath, 'utf8'));
    } else {
        logger.info('SETUP', `Creating new design: ${designName}`);
    }

    const projectId = await prompt('GCP Project ID', existing.projectId || '', true, 'The GCP Project for this infrastructure.');
    const zone = await prompt('GCP Zone', existing.zone || 'us-west1-a', true);
    const machineType = await prompt('GCE Machine Type', existing.machineType || 'n2-standard-8', true, 'e.g. n2-standard-8, n2-highmem-16');
    const backendType = await prompt('Connectivity Backend', existing.backendType || 'direct-internal', true, 'direct-internal, external, or iap');
    const vpcName = await prompt('VPC Name', existing.vpcName || 'default', true);
    const subnetName = await prompt('Subnet Name', existing.subnetName || 'default', true);
    const dnsSuffix = await prompt('Regional DNS Suffix', existing.dnsSuffix || '', true);
    const userSuffix = await prompt('OS Login User Suffix', existing.userSuffix || '', true);
    const sshSourceRangesInput = await prompt('SSH Source Ranges (comma-separated)', existing.sshSourceRanges?.join(',') || '0.0.0.0/0', true, 'Source IP ranges allowed to connect via SSH (e.g., 1.2.3.4/32,5.6.7.8/24)');
    const sshSourceRanges = sshSourceRangesInput.split(',').map(s => s.trim()).filter(Boolean);

    const cpuLimit = await prompt('Capsule CPU Limit', existing.cpuLimit || '2', true, 'Max CPU cores per isolated mission capsule.');
    const memoryLimit = await prompt('Capsule Memory Limit', existing.memoryLimit || '8g', true, 'Max RAM per isolated mission capsule (e.g. 8g, 16g).');
    const reaperIdleLimit = parseInt(await prompt('Auto-Shutdown Idle Limit (hours)', existing.reaperIdleLimit?.toString() || '8', true, 'Number of hours of inactivity before the station auto-shuts down. 0 to disable.'));

    const design: OrbitConfig = { 
        projectId, zone, machineType, backendType: backendType as any, 
        vpcName, subnetName, dnsSuffix, userSuffix, sshSourceRanges,
        cpuLimit, memoryLimit, reaperIdleLimit
    };
    
    if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
    fs.writeFileSync(designPath, JSON.stringify(design, null, 2));
    logger.info('SETUP', `✅ Design '${designName}' saved to global storage.`);
    
    return design;
}

/**
 * MAIN ENTRY POINT: runSetup
 */
export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  loadDotEnv();
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  logger.setVerbose(verbose);
  
  const reconfigure = args.includes('--reconfigure');
  const designMode = args.includes('--profile-mode');
  const repoName = detectRepoName();
  const globalSettings = loadGlobalSettings();

  if (designMode) {
      const name = args.find(a => a.startsWith('--profile='))?.split('=')[1];
      await runDesignMode(name);
      return 0;
  }

  logger.info('SETUP', '\n[ ORBIT MISSION LIFTOFF ]\n');

  // 1. Initial State & Profile Resolution
  let config = getRepoConfig(repoName);
  const profileUrl = args.find(a => a.startsWith('--profile='))?.split('=')[1];
  let selectedDesign = profileUrl || config.profile || globalSettings.activeProfile;

  // Happy Path: No orbit designs found -> Cohesive Setup
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  const localDesigns = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));

  if (localDesigns.length === 0) {
      logger.info('SETUP', 'No orbit designs found. Starting cohesive infrastructure setup...');
      const newDesign = await runDesignMode('default');
      selectedDesign = 'default';
      config = { ...config, ...newDesign, profile: 'default' };
  } else if (profileUrl && profileUrl !== config.profile) {
      logger.info('SETUP', `🔄 Switching to design: ${profileUrl}`);
      const designPath = path.join(PROFILES_DIR, `${profileUrl.toLowerCase()}.json`);
      if (fs.existsSync(designPath)) {
          const designData = JSON.parse(fs.readFileSync(designPath, 'utf8'));
          config = { ...config, ...designData, profile: profileUrl };
      }
  }

  // --- CONFIGURATION PHASE DECISION ---
  const hasFlags = args.some(a => a.startsWith('--') && !['--reconfigure', '--yes', '-y', '--verbose', '--auto-setup-network', '--profile-mode'].includes(a));
  const isFreshRepo = !config.projectId;
  const shouldRunPrompts = isFreshRepo || reconfigure;

  if (shouldRunPrompts) {
      logger.divider('STATION CONFIGURATION');
      
      // Design Selection
      if (localDesigns.length > 1 && !profileUrl) {
          logger.info('SETUP', 'Available Orbit Designs:');
          localDesigns.forEach((p, i) => logger.info('SETUP', `   ${i+1}. ${p.replace('.json', '')}${p.replace('.json', '') === selectedDesign ? ' (Active)' : ''}`));
          const choice = await prompt('Select design number', '1');
          selectedDesign = localDesigns[parseInt(choice) - 1]?.replace('.json', '') || selectedDesign;
          const designData = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, `${selectedDesign}.json`), 'utf8'));
          config = { ...config, ...designData, profile: selectedDesign };
      }

      const rawInstanceName = await prompt('GCE Station Name', config.instanceName || `gcli-station-${env.USER || 'gcli-user'}`, true);
      config.instanceName = sanitizeName(rawInstanceName);
      config.machineType = await prompt('GCE Machine Type', config.machineType || 'n2-standard-8', true);
      config.terminalTarget = await prompt('Terminal Target', config.terminalTarget || 'tab', true) as any;
      config.imageUri = await prompt('Orbit Docker Image', config.imageUri || DEFAULT_IMAGE_URI, true);
      config.autoSetupNet = await confirm('Auto-configure Networking (VPC/NAT)?', config.autoSetupNet ?? false, true);
  } else {
      // Surgical or Fast-Path: Silently apply flags if present
      const rawInstanceName = await prompt('GCE Station Name', config.instanceName || `gcli-station-${env.USER || 'gcli-user'}`, false);
      config.instanceName = sanitizeName(rawInstanceName);
      config.machineType = await prompt('GCE Machine Type', config.machineType || 'n2-standard-8', false);
      config.terminalTarget = await prompt('Terminal Target', config.terminalTarget || 'tab', false) as any;
      config.imageUri = await prompt('Orbit Docker Image', config.imageUri || DEFAULT_IMAGE_URI, false);
      config.autoSetupNet = args.includes('--auto-setup-network') || config.autoSetupNet || false;
      
      const mode = hasFlags ? 'Surgical Update' : 'Fast-Path';
      logger.info('SETUP', `✨ ${mode} using design '${selectedDesign || 'default'}'`);
  }

  // 2. Repository & Security
  logger.divider('REPOSITORY & SECURITY');
  
  // Repo Discovery
  const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'name,nameWithOwner,parent,isFork'], { stdio: 'pipe' });
  let upstreamRepo = config.upstreamRepo || `${UPSTREAM_ORG}/${DEFAULT_REPO_NAME}`;
  if (repoInfoRes.status === 0) {
      const _repoInfo = JSON.parse(repoInfoRes.stdout.toString());
      upstreamRepo = _repoInfo.isFork && _repoInfo.parent ? _repoInfo.parent.nameWithOwner : _repoInfo.nameWithOwner;
      if (!config.userFork) config.userFork = _repoInfo.nameWithOwner;
  }

  if (shouldRunPrompts) {
      const userRes = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' });
      const currentUser = userRes.stdout.toString().trim();
      if (config.userFork?.startsWith(`${currentUser}/`)) {
          logger.info('SETUP', `✅ Repository owned by you: ${config.userFork}`);
      } else {
          config.userFork = await confirm(`Create personal fork for missions?`, true, shouldRunPrompts) ? await createFork(upstreamRepo) : upstreamRepo;
      }
  }
  config.upstreamRepo = upstreamRepo;

  // PAT Management
  if (!fs.existsSync(GLOBAL_TOKENS_DIR)) fs.mkdirSync(GLOBAL_TOKENS_DIR, { recursive: true });
  const tokenPath = path.join(GLOBAL_TOKENS_DIR, `${repoName}.token`);
  let githubToken = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';

  if (!githubToken || reconfigure) {
      logger.info('SETUP', '🔑 GitHub Authentication (Management Container)');
      let suggestedToken = githubToken || env.WORKSPACE_GH_TOKEN || '';
      let source = githubToken ? 'existing' : (env.WORKSPACE_GH_TOKEN ? 'environment' : '');
      
      if (!suggestedToken) {
          const others = fs.readdirSync(GLOBAL_TOKENS_DIR).filter(f => f.endsWith('.token'));
          if (others[0]) {
              suggestedToken = fs.readFileSync(path.join(GLOBAL_TOKENS_DIR, others[0]), 'utf8').trim();
              source = `another repo (${others[0].replace('.token', '')})`;
          }
      }

      if (suggestedToken && await confirm(`Use ${source} GitHub token for ${repoName}?`, true, shouldRunPrompts)) {
          githubToken = suggestedToken;
      } else {
          githubToken = await prompt('GitHub Token', '', true, 'Provide a scoped PAT for the remote management container.', true);
      }
      if (githubToken) fs.writeFileSync(tokenPath, githubToken, { mode: 0o600 });
  }

  if (!githubToken) {
      logger.error('SETUP', '❌ GitHub Token is required.');
      return 1;
  }

  // Temporary Output Management
  const tempDir = await prompt('Temporary Directory', config.tempDir || DEFAULT_TEMP_DIR, shouldRunPrompts, 'Where should mission-specific temporary scripts and logs be stored?');
  const autoClean = await confirm('Auto-cleanup session data?', config.autoClean !== undefined ? config.autoClean : true, shouldRunPrompts);

  config.tempDir = tempDir;
  config.autoClean = autoClean;

  // 3. Persistence
  const updatedGlobal = loadGlobalSettings();
  updatedGlobal.repos[repoName] = { 
      instanceName: config.instanceName, terminalTarget: config.terminalTarget, 
      userFork: config.userFork, upstreamRepo: config.upstreamRepo, 
      imageUri: config.imageUri, profile: selectedDesign,
      machineType: config.machineType,
      sshSourceRanges: config.sshSourceRanges,
      tempDir: config.tempDir,
      autoClean: config.autoClean
  };
  updatedGlobal.activeRepo = repoName;
  if (selectedDesign) updatedGlobal.activeProfile = selectedDesign;
  fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(updatedGlobal, null, 2));

  // 4. Shell Integration
  logger.divider('SHELL INTEGRATION');
  const shellFlag = args.includes('--shell-integration');
  if (shouldRunPrompts || shellFlag) {
      const wantShell = shellFlag || await confirm('Install "orbit" CLI and autocompletion in your shell profile?', true, shouldRunPrompts);
      if (wantShell) {
          const installRes = spawnSync('npx', ['tsx', path.join(SCRIPTS_PATH, 'install-shell.ts')], { stdio: 'inherit' });
          if (installRes.status !== 0) logger.warn('SETUP', '⚠️ Shell integration failed, but continuing liftoff...');
      }
  }

  // 5. Execution (Phase 2 & 3)
  const provider = ProviderFactory.getProvider(config as any);
  logger.divider('STATION LIFTOFF');
  logger.info('SETUP', `Finding station ${config.instanceName}...`);
  let status = await provider.getStatus();
  
  if (config.autoSetupNet) {
      logger.info('SETUP', 'Verifying Network Infrastructure...');
      await (provider as any).provision({ setupNetwork: true, skipInstanceCreation: true });
  }

  if (status.status === 'NOT_FOUND' || status.status === 'UNKNOWN' || status.status === 'ERROR') {
      const shouldProvision = shouldRunPrompts ? await confirm(`Station not found. Provision it now?`, true, shouldRunPrompts) : true;
      if (shouldProvision) {
          const start = Date.now();
          logger.info('SETUP', `Provisioning new station ${config.instanceName}...`);
          const res = await provider.provision({ setupNetwork: config.autoSetupNet || false });
          if (res !== 0) return res;
          status = await provider.getStatus();
          logger.info('SETUP', `✅ Provisioning complete in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
      } else return 1;
  }

  if (status.status !== 'RUNNING') {
      const start = Date.now();
      logger.info('SETUP', `Waking up station...`);
      await provider.ensureReady();
      logger.info('SETUP', `✅ Station awake in ${((Date.now() - start) / 1000).toFixed(1)}s.`);
  }

  logger.divider('REMOTE INITIALIZATION');
  await provider.ensureReady();
  const rawUser = env.USER || 'node';
  const fullUser = `${rawUser}${config.userSuffix || ''}`;
  
  const setupRes = await provider.setup({ 
      projectId: config.projectId!, zone: config.zone!, 
      dnsSuffix: config.dnsSuffix!, userSuffix: config.userSuffix!, 
      backendType: config.backendType as any
  });
  if (setupRes !== 0) return setupRes;

  // Remote setup logic (Clone, Sync, Link)
  logger.info('REMOTE', 'Synchronizing Mission Logic...');
  let res = await provider.exec(`sudo mkdir -p ${MAIN_REPO_PATH} ${SATELLITE_WORKTREES_PATH} ${POLICIES_PATH} ${SCRIPTS_PATH} ${CONFIG_DIR} ${EXTENSION_REMOTE_PATH}`);
  if (res !== 0) return res;
  res = await provider.exec(`sudo chown -R 1000:1000 ${ORBIT_ROOT} && sudo chmod -R 770 ${ORBIT_ROOT}`);
  if (res !== 0) return res;
  
  logger.info('REMOTE', 'Syncing extension source...');
  res = await provider.sync(EXTENSION_ROOT + '/', `${EXTENSION_REMOTE_PATH}/`, { delete: true, exclude: ['node_modules', '.git', 'bundle', 'dist'] });
  if (res !== 0) return res;
  
  const policyFile = path.join(EXTENSION_ROOT, '.gemini/policies/workspace-policy.toml');
  if (fs.existsSync(policyFile)) {
      res = await provider.sync(policyFile, `${POLICIES_PATH}/orbit-policy.toml`, { sudo: true });
      if (res !== 0) return res;
  }

  logger.info('REMOTE', 'Linking extension...');
  res = await provider.exec(`sudo docker exec -u node -e GEMINI_API_KEY=dummy ${provider.stationName} /usr/local/share/npm-global/bin/gemini extensions link ${EXTENSION_REMOTE_PATH}`);
  if (res !== 0) return res;

  const netrc = `machine github.com login oauth-basic password ${githubToken}`;
  await provider.exec(`echo "${netrc}" | sudo tee /home/${fullUser}/.netrc > /dev/null && sudo chown ${fullUser}:${fullUser} /home/${fullUser}/.netrc && sudo chmod 600 /home/${fullUser}/.netrc`);

  logger.info('REMOTE', `Finalizing Repository (${config.userFork})...`);
  const remoteWorkDir = `${ORBIT_ROOT}/main/${repoName}`;
  const repoUrl = `https://github.com/${config.userFork}.git`;
  const upstreamUrl = `https://github.com/${config.upstreamRepo}.git`;

  const cloneCmd = `
    sudo mkdir -p $(dirname ${remoteWorkDir}) && sudo chown -R 1000:1000 $(dirname ${remoteWorkDir}) && \
    if [ ! -d "${remoteWorkDir}/.git" ]; then
      sudo rm -rf ${remoteWorkDir} && \
      sudo HOME=/home/${fullUser} git clone --quiet -c core.filemode=false ${repoUrl} ${remoteWorkDir} && \
      sudo HOME=/home/${fullUser} git -C ${remoteWorkDir} remote add upstream ${upstreamUrl} || true
    fi && \
    sudo HOME=/home/${fullUser} git -C ${remoteWorkDir} fetch --quiet upstream && \
    sudo chown -R 1000:1000 ${ORBIT_ROOT}
  `;
  res = await provider.exec(cloneCmd);
  if (res !== 0) return res;

  logger.info('SETUP', '\n✨ ALL SYSTEMS GO! Your Gemini Orbit is ready.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(e => logger.error('FATAL', e));
}
