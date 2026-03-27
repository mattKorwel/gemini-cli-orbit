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
import { ProviderFactory } from './providers/ProviderFactory.js';
import { 
  loadGlobalSettings, 
  loadProjectConfig, 
  getRepoConfig, 
  detectRepoName 
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
  PROJECT_CONFIG_PATH,
  PROJECT_ORBIT_DIR,
  GLOBAL_ORBIT_DIR,
  UPSTREAM_REPO_URL,
  UPSTREAM_ORG,
  DEFAULT_REPO_NAME,
  type OrbitConfig,
  type OrbitSettings 
} from './Constants.js';


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = process.cwd();

/**
 * Loads and parses a local .env file from the repository root and the home directory.
 */
function loadDotEnv() {
  const envPaths = [
    path.join(REPO_ROOT, '.env'),
    path.join(os.homedir(), '.env')
  ];

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

async function prompt(question: string, defaultValue: string, explanation?: string, sensitive: boolean = false): Promise<string> {
  const args = process.argv.slice(2);
  const autoAccept = args.includes('--yes') || args.includes('-y');
  
  // Check for specific flag overrides (e.g. --project=foo)
  const flagName = question.toLowerCase().replace(/\s+/g, '-');
  const flagOverride = args.find(a => a.startsWith(`--${flagName}=`))?.split('=')[1];
  
  if (flagOverride !== undefined) return flagOverride;
  if (autoAccept) return defaultValue;

  if (explanation) {
      console.log(`\n📖 ${explanation}`);
  }

  const displayDefault = sensitive && defaultValue ? `${defaultValue.substring(0, 4)}...${defaultValue.substring(defaultValue.length - 4)}` : defaultValue;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const promptMsg = defaultValue 
    ? `❓ ${question} [Detected: ${displayDefault}] (Press <Enter> to keep, or type new value): `
    : `❓ ${question} (<Enter> for none): `;

  return new Promise((resolve) => {
    rl.question(promptMsg, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function confirm(question: string, defaultValue: boolean = true): Promise<boolean> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept) return defaultValue;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const promptMsg = `❓ ${question} (${defaultValue ? 'Y/n' : 'y/N'}): `;
    rl.question(promptMsg, (answer) => {
      rl.close();
      if (!answer.trim()) {
        resolve(defaultValue);
      } else {
        resolve(answer.trim().toLowerCase() === 'y');
      }
    });
  });
}

async function createFork(upstream: string): Promise<string> {
    console.log(`   - Creating fork for ${upstream}...`);
    const forkRes = spawnSync('gh', ['repo', 'fork', upstream, '--clone=false'], { stdio: 'inherit' });
    if (forkRes.status === 0) {
        const userRes = spawnSync('gh', ['api', 'user', '-q', '.login'], { stdio: 'pipe' });
        const user = userRes.stdout.toString().trim();
        return `${user}/${upstream.split('/')[1]}`;
    }
    return upstream;
}

export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  loadDotEnv();
  const args = process.argv.slice(2);
  const reconfigure = args.includes('--reconfigure');
  const skipConfigArg = args.includes('--yes') || args.includes('-y');
  const profileUrl = args.find(a => a.startsWith('--profile='))?.split('=')[1];

  console.log(`
================================================================================
🚀 GEMINI ORBIT: HIGH-PERFORMANCE REMOTE MISSIONS
================================================================================
Orbit allows you to delegate heavy tasks (PR reviews, automated corrections,
and full builds) to a dedicated, high-performance host station.
================================================================================
  `);

  console.log('📝 PHASE 1: MISSION CONFIGURATION');
  console.log('--------------------------------------------------------------------------------');

  // 0. Load Hierarchy
  const globalSettings = loadGlobalSettings();
  const repoName = detectRepoName();
  
  // Resolve current effective config
  let config = getRepoConfig(repoName);

  // Profile Selection / Creation
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  const localProfiles = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
  
  let selectedProfile = config.profile || globalSettings.activeProfile;

  if (!selectedProfile && localProfiles.length === 0 && !skipConfigArg) {
      console.log('✨ No profiles found. Creating "default" profile for your infrastructure...');
      selectedProfile = 'default';
      const defaultProfilePath = path.join(PROFILES_DIR, 'default.json');
      fs.writeFileSync(defaultProfilePath, JSON.stringify({}, null, 2));
  }

  if (!profileUrl && !skipConfigArg && localProfiles.length > 0) {
      console.log(`📋 Found ${localProfiles.length} global orbit profiles:`);
      localProfiles.forEach((p, i) => {
          const name = p.replace('.json', '');
          const indicator = name === selectedProfile ? ' (Active)' : '';
          console.log(`   ${i + 1}. ${name}${indicator}`);
      });
      console.log(`   0. Use Current / Create New`);
      
      const choice = await prompt('Select a profile number or 0', '0');
      if (choice !== '0') {
          selectedProfile = localProfiles[parseInt(choice) - 1]?.replace('.json', '');
      }
  }

  // Load selected profile data
  let profileData: Partial<OrbitConfig> = {};
  if (selectedProfile) {
      const profilePath = path.join(PROFILES_DIR, selectedProfile.endsWith('.json') ? selectedProfile : `${selectedProfile}.json`);
      if (fs.existsSync(profilePath)) {
          profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      }
  }

  // Reload config with the potentially new profile
  config = { ...config, ...profileData, profile: selectedProfile };

  console.log('\n🔍 Detecting repository origins...');
  let upstreamRepo = config.upstreamRepo || `${UPSTREAM_ORG}/${DEFAULT_REPO_NAME}`;
  
  const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'name,nameWithOwner,parent,isFork'], { stdio: 'pipe' });
  if (repoInfoRes.status === 0) {
      try {
          const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
          upstreamRepo = repoInfo.isFork && repoInfo.parent ? repoInfo.parent.nameWithOwner : repoInfo.nameWithOwner;
      } catch (e) {}
  }

  let skipConfig = false;
  if (config.projectId && !reconfigure) {
      console.log(`   ✅ Existing configuration found for repo: ${repoName}`);
      skipConfig = skipConfigArg || await confirm('Use existing configuration and skip to execution?');
  }

  // 1. Project Identity & Networking
  let projectId = config.projectId || '';
  let zone = config.zone || 'us-west1-a';
  let instanceName = config.instanceName || `gcli-station-${env.USER || 'gcli-user'}`;
  let terminalTarget = config.terminalTarget || 'tab';
  let userFork = config.userFork || upstreamRepo;
  let dnsSuffix = config.dnsSuffix || '';
  let userSuffix = config.userSuffix || '';
  let backendType = config.backendType || 'direct-internal';
  let imageUri = config.imageUri || 'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
  let vpcName = config.vpcName || 'default';
  let subnetName = config.subnetName || 'default';
  let autoSetupNet = false;

  if (!skipConfig) {
      projectId = await prompt('GCP Project ID', projectId, 
        'The GCP Project where your orbit station will live. Your personal project is recommended.');
      
      if (!projectId) {
          console.error('❌ Project ID is required.');
          return 1;
      }

      zone = await prompt('GCP Zone', zone, 
        'The GCE zone where your station will be provisioned.');

      instanceName = await prompt('GCE Station Name', instanceName,
        'The name of the GCE VM that will act as your mission station.');

      terminalTarget = await prompt('Terminal Target (foreground, background, tab, window)', terminalTarget,
        'Default display mode for new orbit missions.') as any;

      console.log('\n🌐 Networking Configuration:');
      backendType = await prompt('Connectivity Backend (direct-internal, external, iap)', backendType,
        'direct-internal: VPC-internal DNS\nexternal: Public IP\niap: GCP IAP tunnel') as any;

      dnsSuffix = await prompt('Regional DNS Suffix', dnsSuffix,
        'Optional suffix for internal DNS (e.g. .gcpnode.com).');

      userSuffix = await prompt('OS Login User Suffix', userSuffix,
        'Optional suffix for usernames (e.g. _google_com).');

      imageUri = await prompt('Orbit Docker Image', imageUri,
        'The Docker image used for the station supervisor and satellite capsules.');

      autoSetupNet = await confirm('Auto-configure VPC/Subnet?', false);

      if (!autoSetupNet) {
          vpcName = await prompt('VPC Name', vpcName, 'The existing VPC to use.');
          subnetName = await prompt('Subnet Name', subnetName, 'The existing Subnet to use.');
      }

      // 2. Repository Discovery (Dynamic)
      if (repoInfoRes.status === 0) {
          try {
              const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
              console.log(`   - Searching for your forks of ${upstreamRepo}...`);
              
              const gqlQuery = `query { viewer { repositories(first: 100, isFork: true, affiliations: OWNER) { nodes { nameWithOwner parent { nameWithOwner } } } } }`;
              const forksRes = spawnSync('gh', ['api', 'graphql', '-f', `query=${gqlQuery}`, '--jq', `.data.viewer.repositories.nodes[] | select(.parent.nameWithOwner == "${upstreamRepo}") | .nameWithOwner`], { stdio: 'pipe' });
              const myForks = forksRes.stdout.toString().trim().split('\n').filter(Boolean);

              if (myForks.length > 0) {
                  console.log('\n🍴 Found existing forks:');
                  myForks.forEach((name: string, i: number) => console.log(`   [${i + 1}] ${name}`));
                  console.log(`   [c] Create a new fork`);
                  console.log(`   [u] Use upstream directly (not recommended)`);

                  const choice = await prompt('Select an option', '1');
                  if (choice.toLowerCase() === 'c') {
                      userFork = await createFork(upstreamRepo);
                  } else if (choice.toLowerCase() === 'u') {
                      userFork = upstreamRepo;
                  } else {
                      const idx = parseInt(choice) - 1;
                      userFork = (myForks[idx] || myForks[0])!;
                  }
              } else {
                  const shouldFork = await confirm('No fork detected. Create a personal fork for sandboxed implementations?');
                  userFork = shouldFork ? await createFork(upstreamRepo) : upstreamRepo;
              }
          } catch (e) {
              userFork = upstreamRepo;
          }
      }
      
      console.log(`   ✅ Upstream:    ${upstreamRepo}`);
      console.log(`   ✅ Orbit:   ${userFork}`);
  }

  // 3. Security & Auth
  const localGhTokenPath = path.join(PROJECT_ORBIT_DIR, 'gh_token');
  let githubToken = env.WORKSPACE_GH_TOKEN || '';
  
  if (!githubToken && fs.existsSync(localGhTokenPath)) {
      githubToken = fs.readFileSync(localGhTokenPath, 'utf8').trim();
  }

  if (githubToken) {
      if (!skipConfig) {
          githubToken = await prompt('GitHub Token', githubToken, 'A GitHub PAT is required for remote repository access.', true);
      }
  } else {
      console.log('\n🔑 GitHub PAT is missing.');
      githubToken = await prompt('Paste Scoped Token', '');
  }

  if (!githubToken) {
      console.error('❌ GitHub Token is required.');
      return 1;
  }

  if (!fs.existsSync(PROJECT_ORBIT_DIR)) fs.mkdirSync(PROJECT_ORBIT_DIR, { recursive: true });
  fs.writeFileSync(localGhTokenPath, githubToken, { mode: 0o600 });

  // 4. Gemini API Auth
  const localSettingsPath = path.join(env.HOME || '', '.gemini/settings.json');
  let authStrategy = 'google_accounts';
  let geminiApiKey = env.WORKSPACE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';

  if (fs.existsSync(localSettingsPath)) {
      try {
          const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
          authStrategy = localSettings.security?.auth?.selectedType || 'google_accounts';
          if (!geminiApiKey && localSettings.security?.auth?.apiKey) {
              geminiApiKey = localSettings.security.auth.apiKey;
          }
      } catch (e) {}
  }

  if (authStrategy === 'gemini-api-key') {
      if (!skipConfig) {
          geminiApiKey = await prompt('Gemini API Key', geminiApiKey, 'Enter to use? Or paste a new one', true);
      }
  } else {
      console.log(`🔐 Using current auth strategy: ${authStrategy}`);
  }

  // 5. Save Partitioned Configuration
  if (!fs.existsSync(GLOBAL_ORBIT_DIR)) fs.mkdirSync(GLOBAL_ORBIT_DIR, { recursive: true });
  
  // Save INFRASTRUCTURE to Profile
  if (selectedProfile) {
      const profilePath = path.join(PROFILES_DIR, `${selectedProfile.toLowerCase()}.json`);
      const profileToSave = {
          projectId, zone, vpcName, subnetName, dnsSuffix, userSuffix, backendType
      };
      fs.writeFileSync(profilePath, JSON.stringify(profileToSave, null, 2));
      console.log(`✅ Infrastructure saved to profile: ${selectedProfile}`);
  }

  // Save CUSTOMIZATION and LINK to Global Registry
  const repoCustomization: OrbitConfig = { 
    instanceName, terminalTarget: terminalTarget as any, 
    userFork, upstreamRepo, imageUri, profile: selectedProfile
  };

  const updatedGlobalSettings = loadGlobalSettings();
  updatedGlobalSettings.repos[repoName] = repoCustomization;
  updatedGlobalSettings.activeRepo = repoName;
  if (selectedProfile) updatedGlobalSettings.activeProfile = selectedProfile;
  
  fs.writeFileSync(GLOBAL_SETTINGS_PATH, JSON.stringify(updatedGlobalSettings, null, 2));
  console.log(`✅ Repository link saved to global registry.`);

  // 6. Transition to Execution
  const repoConfig = getRepoConfig(repoName);
  const cleanProviderConfig: any = {
      projectId: repoConfig.projectId!,
      zone: repoConfig.zone!,
      instanceName: repoConfig.instanceName!,
  };
  Object.keys(repoConfig).forEach(k => {
      if ((repoConfig as any)[k] !== undefined) cleanProviderConfig[k] = (repoConfig as any)[k];
  });
  const provider = ProviderFactory.getProvider(cleanProviderConfig);

  console.log('\n🏗️  PHASE 2: STATION LIFTOFF');
  console.log('--------------------------------------------------------------------------------');
  console.log(`   - Verifying access and finding station ${instanceName}...`);
  let status = await provider.getStatus();
  
  if (status.status === 'UNKNOWN' || status.status === 'ERROR') {
    const shouldProvision = await confirm(`Station ${instanceName} not found. Provision it now?`);
    if (!shouldProvision) return 1;
    
    const provisionRes = await provider.provision({ setupNetwork: autoSetupNet });
    if (provisionRes !== 0) return 1;
    status = await provider.getStatus();
  }

  if (status.status !== 'RUNNING') {
    console.log(`   - Waking up station ${instanceName}...`);
    await provider.ensureReady();
  }

  console.log('\n🚀 PHASE 3: REMOTE INITIALIZATION');
  console.log('--------------------------------------------------------------------------------');
  await provider.ensureReady();

  const setupRes = await provider.setup({ 
      projectId, zone, dnsSuffix, userSuffix, backendType: backendType as any
  });
  if (setupRes !== 0) return setupRes;

  console.log(`\n📦 Synchronizing Mission Logic & Credentials...`);
  await provider.exec(`sudo mkdir -p ${MAIN_REPO_PATH} ${SATELLITE_WORKTREES_PATH} ${POLICIES_PATH} ${SCRIPTS_PATH} ${CONFIG_DIR} ${EXTENSION_REMOTE_PATH}`);
  await provider.exec(`sudo chown -R 1000:1000 ${ORBIT_ROOT} && sudo chmod -R 777 ${ORBIT_ROOT}`);
  
  console.log('📦 Syncing extension source and skills...');
  await provider.sync(EXTENSION_ROOT + '/', `${EXTENSION_REMOTE_PATH}/`, { 
      delete: true, sudo: true, exclude: ['node_modules', '.git', '.gemini/orbit/profiles'] 
  });
  await provider.sync(path.join(EXTENSION_ROOT, '.gemini/policies/orbit-policy.toml'), `${POLICIES_PATH}/orbit-policy.toml`, { sudo: true });

  console.log('🔗 Linking extension in remote capsule...');
  await provider.exec(`sudo docker exec -u node -e GEMINI_API_KEY=dummy station-supervisor /usr/local/share/npm-global/bin/gemini extensions link ${EXTENSION_REMOTE_PATH}`);

  console.log('⚙️  Initializing remote Gemini configuration...');
  const remoteSettings = {
    security: { auth: { selectedType: authStrategy }, folderTrust: { enabled: false } },
    ui: { theme: 'Shades Of Purple', useAlternateBuffer: true, useBackgroundColor: true },
    general: { enableAutoUpdate: false }
  };
  
  const tmpSettingsPath = path.join(os.tmpdir(), `remote-settings-${Date.now()}.json`);
  fs.writeFileSync(tmpSettingsPath, JSON.stringify(remoteSettings, null, 2));
  await provider.sync(tmpSettingsPath, `${CONFIG_DIR}/settings.json`, { sudo: true });
  fs.unlinkSync(tmpSettingsPath);

  if (authStrategy !== 'gemini-api-key' && (authStrategy === 'google_accounts' || authStrategy === 'oauth-personal')) {
      const localCreds = path.join(os.homedir(), '.gemini/google_accounts.json');
      if (fs.existsSync(localCreds)) {
        await provider.sync(localCreds, `${CONFIG_DIR}/google_accounts.json`, { sudo: true });
        console.log('   ✅ Synchronized Google Accounts credentials.');
      }
  }

  if (githubToken) {
    await provider.exec(`echo ${githubToken} | sudo tee ${ORBIT_ROOT}/.gh_token > /dev/null`);
    console.log('   ✅ Uploaded GitHub PAT to remote station.');
  }

  console.log(`🚀 Finalizing Remote Mission Repository (${userFork})...`);
  const repoUrl = `https://github.com/${userFork}.git`;
  const remoteWorkDir = `${ORBIT_ROOT}/main/${repoName}`;
  const upstreamUrl = `https://github.com/${upstreamRepo}.git`;

  const setupRepoCmd = `
    sudo mkdir -p $(dirname ${remoteWorkDir}) && \
    if [ ! -d "${remoteWorkDir}/.git" ]; then
      sudo rm -rf ${remoteWorkDir} && \
      sudo git clone --quiet -c core.filemode=false ${repoUrl} ${remoteWorkDir} && \
      sudo git -C ${remoteWorkDir} remote add upstream ${upstreamUrl}
    fi && \
    sudo git -C ${remoteWorkDir} -c safe.directory='*' fetch --quiet upstream && \
    sudo chown -R 1000:1000 ${ORBIT_ROOT}
  `;
  await provider.exec(setupRepoCmd);

  console.log('\n✨ ALL SYSTEMS GO! Your Gemini Orbit is ready.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}

