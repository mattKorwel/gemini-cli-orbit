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
import { ProviderFactory } from './providers/ProviderFactory.ts';
import { fileURLToPath } from 'node:url';
import { 
  WORKSPACES_ROOT, 
  MAIN_REPO_PATH, 
  WORKTREES_PATH, 
  POLICIES_PATH, 
  SCRIPTS_PATH, 
  CONFIG_DIR,
  EXTENSION_REMOTE_PATH,
  PROFILES_DIR,
  UPSTREAM_REPO_URL,
  UPSTREAM_ORG,
  DEFAULT_REPO_NAME,
  type WorkspaceConfig 
} from './Constants.ts';


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
          const key = match[1].trim();
          const val = match[2].trim().replace(/^["'](.*)["']$/, '$1');
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
  
  const finalValue = flagOverride || (autoAccept && defaultValue ? defaultValue : null);
  if (finalValue !== null) return finalValue;

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

async function confirm(question: string): Promise<boolean> {
  const autoAccept = process.argv.includes('--yes') || process.argv.includes('-y');
  if (autoAccept) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`❓ ${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
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

async function fetchRemoteSettings(url: string): Promise<Partial<WorkspaceConfig>> {
  console.log(`🌐 Fetching remote workspace profile from: ${url}...`);
  try {
    if (url.startsWith('http')) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
        const data = await res.json() as any;
        return data.workspace || data;
    } else if (fs.existsSync(url)) {
        const data = JSON.parse(fs.readFileSync(url, 'utf8'));
        return data.workspace || data;
    }
    throw new Error(`Unsupported profile source: ${url}`);
  } catch (e) {
    console.error(`   ❌ Failed to load remote profile: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}

export async function runSetup(env: NodeJS.ProcessEnv = process.env) {
  loadDotEnv();
  const args = process.argv.slice(2);
  const reconfigure = args.includes('--reconfigure');
  const skipConfigArg = args.includes('--yes') || args.includes('-y');
  let profileUrl = args.find(a => a.startsWith('--profile='))?.split('=')[1];

  console.log(`
================================================================================
🚀 GEMINI WORKSPACES: HIGH-PERFORMANCE REMOTE DEVELOPMENT
================================================================================
Workspaces allow you to delegate heavy tasks (PR reviews, agentic fixes,
and full builds) to a dedicated, high-performance GCP worker.
================================================================================
  `);

  console.log('📝 PHASE 1: CONFIGURATION');
  console.log('--------------------------------------------------------------------------------');

  const settingsPath = path.join(REPO_ROOT, '.gemini/workspaces/settings.json');
  let settings: { workspace: WorkspaceConfig } = {
      workspace: {
          projectId: '', zone: 'us-west1-a', terminalTarget: 'tab',
          userFork: '', upstreamRepo: `${UPSTREAM_ORG || 'google-gemini'}/${DEFAULT_REPO_NAME || 'gemini-cli'}`,
          remoteHost: 'gcli-worker', remoteWorkDir: MAIN_REPO_PATH,
          useContainer: true,
          dnsSuffix: typeof DEFAULT_DNS_SUFFIX !== 'undefined' ? DEFAULT_DNS_SUFFIX : '.c.${projectId}.internal',
          userSuffix: typeof DEFAULT_USER_SUFFIX !== 'undefined' ? DEFAULT_USER_SUFFIX : '',
          backendType: 'direct-internal'
      }
  };

  // Profile Discovery (if no profile passed via CLI)
  if (profileUrl && !profileUrl.startsWith('http') && !fs.existsSync(profileUrl)) {
      // Try to find by name in local profiles
      const potentialPath = path.join(PROFILES_DIR, profileUrl.endsWith('.json') ? profileUrl : `${profileUrl}.json`);
      if (fs.existsSync(potentialPath)) {
          profileUrl = potentialPath;
      }
  }

  if (!profileUrl && !skipConfigArg && fs.existsSync(PROFILES_DIR)) {
      const localProfiles = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
      if (localProfiles.length > 0) {
          console.log(`📋 Found ${localProfiles.length} local workspace profiles:`);
          localProfiles.forEach((p, i) => console.log(`   ${i + 1}. ${p.replace('.json', '')}`));
          console.log(`   0. Create New / Use Current`);
          
          const choice = await prompt('Select a profile number or 0', '0');
          if (choice !== '0') {
              const selectedFile = localProfiles[parseInt(choice) - 1];
              if (selectedFile) {
                  profileUrl = path.join(PROFILES_DIR, selectedFile);
              }
          }
      }
  }

  let remoteProfile: Partial<WorkspaceConfig> = {};
  if (profileUrl) {
    remoteProfile = await fetchRemoteSettings(profileUrl);
  }

  let skipConfig = false;

  if (fs.existsSync(settingsPath)) {
      try {
          const existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          if (existingSettings.workspace) {
              settings = existingSettings;
              if (!reconfigure && !profileUrl) {
                  console.log('   ✅ Existing configuration found.');
                  skipConfig = skipConfigArg || await confirm('Use existing configuration and skip to execution?');
              }
          }
      } catch (e) {}
  }

  // 1. Project Identity & Networking
  let projectId = remoteProfile.projectId || settings.workspace?.projectId || '';
  let zone = remoteProfile.zone || settings.workspace?.zone || 'us-west1-a';
  let terminalTarget = remoteProfile.terminalTarget || settings.workspace?.terminalTarget || 'tab';
  let upstreamRepo = remoteProfile.upstreamRepo || settings.workspace?.upstreamRepo || `${(typeof UPSTREAM_ORG !== 'undefined' ? UPSTREAM_ORG : 'google-gemini')}/${(typeof DEFAULT_REPO_NAME !== 'undefined' ? DEFAULT_REPO_NAME : 'gemini-cli')}`;
  let userFork = remoteProfile.userFork || settings.workspace?.userFork || upstreamRepo;
  let dnsSuffix = remoteProfile.dnsSuffix || settings.workspace?.dnsSuffix || (typeof DEFAULT_DNS_SUFFIX !== 'undefined' ? DEFAULT_DNS_SUFFIX : '.c.${projectId}.internal');
  let userSuffix = remoteProfile.userSuffix || settings.workspace?.userSuffix || (typeof DEFAULT_USER_SUFFIX !== 'undefined' ? DEFAULT_USER_SUFFIX : '');
  let backendType = remoteProfile.backendType || settings.workspace?.backendType || 'direct-internal';

  if (!skipConfig || profileUrl) {
      const defaultProject = env.GOOGLE_CLOUD_PROJECT || env.WORKSPACE_PROJECT || projectId || '';
      projectId = await prompt('GCP Project ID', defaultProject, 
        'The GCP Project where your workspace worker will live. Your personal project is recommended.');
      
      if (!projectId) {
          console.error('❌ Project ID is required. Set GOOGLE_CLOUD_PROJECT or enter it manually.');
          return 1;
      }

      zone = await prompt('GCP Zone', env.WORKSPACE_ZONE || zone, 
        'The GCE zone where your worker will be provisioned.');

      terminalTarget = await prompt('Terminal Target (foreground, background, tab, window)', env.WORKSPACE_TERM_TARGET || terminalTarget,
        'When you start a job in gemini-cli, should it run as a foreground shell, background shell (no attach), new iterm2 tab, or new iterm2 window?');

      console.log('\n🌐 Networking Configuration:');
      backendType = await prompt('Connectivity Backend (direct-internal, external, iap)', env.WORKSPACE_BACKEND_TYPE || backendType,
        'direct-internal: Use magic hostname (Fastest, VPC-internal)\nexternal: Use Public IP (if enabled)\niap: Use gcloud IAP tunnel (Secure off-VPC fallback)') as any;

      dnsSuffix = await prompt('Regional DNS Suffix', env.WORKSPACE_DNS_SUFFIX || dnsSuffix,
        'Optional suffix that follows ".internal" for your specific network (e.g. ".gcpnode.com" or enter for none).');

      userSuffix = await prompt('OS Login User Suffix', env.WORKSPACE_USER_SUFFIX || userSuffix,
        'Optional suffix for OS Login usernames (e.g. "_google_com" for corporate environments).');

      // 2. Repository Discovery (Dynamic)
      console.log('\n🔍 Detecting repository origins...');
      
      const repoInfoRes = spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner,parent,isFork'], { stdio: 'pipe' });

      if (repoInfoRes.status === 0) {
          try {
              const repoInfo = JSON.parse(repoInfoRes.stdout.toString());
              upstreamRepo = repoInfo.isFork && repoInfo.parent ? repoInfo.parent.nameWithOwner : repoInfo.nameWithOwner;
              
              console.log(`   - Upstream identified: ${upstreamRepo}`);
              console.log(`   - Searching for your forks of ${upstreamRepo}...`);
              
              const upstreamOwner = upstreamRepo.split('/')[0];
              const upstreamName = upstreamRepo.split('/')[1];

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
                      userFork = myForks[idx] || myForks[0];
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
      console.log(`   ✅ Workspace:   ${userFork}`);
  }

  // 3. Security & Auth (Always check for token, force prompt if missing)
  const localGhTokenPath = path.join(REPO_ROOT, '.gemini/workspaces/gh_token');
  let githubToken = env.WORKSPACE_GH_TOKEN || '';
  
  if (!githubToken && fs.existsSync(localGhTokenPath)) {
      githubToken = fs.readFileSync(localGhTokenPath, 'utf8').trim();
  }

  if (githubToken) {
      console.log('🔐 Found GitHub PAT in environment or settings.');
      if (!skipConfig) {
          githubToken = await prompt('GitHub Token', githubToken, 'A GitHub PAT is required for remote repository access and PR operations.', true);
      }
  } else {
      console.log('\n🔑 GitHub PAT is missing. A token with "Contents" and "Pull Request" access is required.');
      const hasToken = await confirm('Do you already have a GitHub Personal Access Token (PAT)?');
      if (hasToken) {
          githubToken = await prompt('Paste Scoped Token', '');
      } else {
          const shouldGenToken = await confirm('Would you like to generate a new scoped token now? (Highly Recommended)');
          if (shouldGenToken) {
              const baseUrl = 'https://github.com/settings/personal-access-tokens/new';
              const name = `Workspace-${env.USER}`;
              const repoParams = userFork !== upstreamRepo 
                  ? `&repositories[]=${encodeURIComponent(upstreamRepo)}&repositories[]=${encodeURIComponent(userFork)}`
                  : `&repositories[]=${encodeURIComponent(upstreamRepo)}`;

              const magicLink = `${baseUrl}?name=${encodeURIComponent(name)}&description=Gemini+Workspaces+Worker${repoParams}&contents=write&pull_requests=write&metadata=read`;
              const terminalLink = `\u001b]8;;${magicLink}\u0007${magicLink}\u001b]8;;\u0007`;

              console.log(`\n🔐 ACTION REQUIRED: Create a token with the required permissions:`);
              console.log(`\n${terminalLink}\n`);
              
              githubToken = await prompt('Paste Scoped Token', '');
          }
      }
  }

  if (!githubToken) {
      console.error('❌ GitHub Token is required to provision the workspace.');
      return 1;
  }

  // Persist the token locally for future runs
  if (githubToken) {
      if (!fs.existsSync(path.dirname(localGhTokenPath))) fs.mkdirSync(path.dirname(localGhTokenPath), { recursive: true });
      fs.writeFileSync(localGhTokenPath, githubToken, { mode: 0o600 });
  }

  // 4. Gemini API Auth Strategy
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
      if (geminiApiKey) {
          console.log('🔐 Found Gemini API Key in environment or settings.');
          if (!skipConfig) {
              geminiApiKey = await prompt('Gemini API Key', geminiApiKey, 'Enter to use? Or paste a new one', true);
          }
      } else {
          console.log('\n📖 In API Key mode, the remote worker needs your Gemini API Key to authenticate.');
          geminiApiKey = await prompt('Gemini API Key', '', 'Paste your Gemini API Key', true);
      }
  } else {
      console.log(`🔐 Using current auth strategy: ${authStrategy}`);
  }

  // 5. Save Confirmed State
  const workspaceUser = env.USER || env.USERNAME || 'gcli-user';
  const targetVM = `gcli-workspace-${workspaceUser}`;
  if (!fs.existsSync(path.dirname(settingsPath))) fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  
  const workspaceConfig: WorkspaceConfig = { 
    projectId, zone, terminalTarget: terminalTarget as any, 
    userFork, upstreamRepo,
    remoteHost: 'gcli-worker',
    remoteWorkDir: MAIN_REPO_PATH,
    useContainer: true,
    dnsSuffix,
    userSuffix,
    backendType: backendType as any
  };

  settings = { workspace: workspaceConfig };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`\n✅ Configuration saved to ${settingsPath}`);

  // Option to save as profile
  if (!skipConfig || reconfigure) {
      const shouldSaveProfile = await confirm('Save this configuration as a named profile?');
      if (shouldSaveProfile) {
          const profileName = await prompt('Profile Name (e.g. sandbox, corp)', '');
          if (profileName) {
              if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
              const profilePath = path.join(PROFILES_DIR, `${profileName.toLowerCase()}.json`);
              fs.writeFileSync(profilePath, JSON.stringify(settings, null, 2));
              console.log(`✅ Profile saved to ${profilePath}`);
          }
      }
  }

  // Transition to Execution
  const provider = ProviderFactory.getProvider({ 
      projectId, 
      zone, 
      instanceName: targetVM,
      dnsSuffix,
      userSuffix,
      backendType
  });

  console.log('\n🏗️  PHASE 2: INFRASTRUCTURE');
  console.log('--------------------------------------------------------------------------------');
  console.log(`   - Verifying access and finding worker ${targetVM}...`);
  let status = await provider.getStatus();
  
  if (status.status === 'UNKNOWN' || status.status === 'ERROR') {
    const shouldProvision = await confirm(`Worker ${targetVM} not found. Provision it now?`);
    if (!shouldProvision) return 1;
    
    const provisionRes = await provider.provision();
    if (provisionRes !== 0) return 1;
    status = await provider.getStatus();
  }

  if (status.status !== 'RUNNING') {
    console.log('   - Waking up worker...');
    await provider.ensureReady();
  }

  console.log('\n🚀 PHASE 3: REMOTE INITIALIZATION');
  console.log('--------------------------------------------------------------------------------');
  const setupRes = await provider.setup({ 
      projectId, 
      zone, 
      dnsSuffix,
      userSuffix,
      backendType: backendType as any
  });
  if (setupRes !== 0) return setupRes;

  console.log(`\n📦 Synchronizing Logic & Credentials...`);
  // Ensure the directory structure exists on the host
  await provider.exec(`sudo mkdir -p ${MAIN_REPO_PATH} ${WORKTREES_PATH} ${POLICIES_PATH} ${SCRIPTS_PATH} ${CONFIG_DIR} ${EXTENSION_REMOTE_PATH}`);
  await provider.exec(`sudo chown -R 1000:1000 ${WORKSPACES_ROOT}`);
  await provider.exec(`sudo chmod -R 777 ${WORKSPACES_ROOT}`);
  
  // 1. Sync Full Extension & Policies
  console.log('📦 Syncing extension source and skills...');
  await provider.sync(EXTENSION_ROOT + '/', `${EXTENSION_REMOTE_PATH}/`, { 
      delete: true, 
      sudo: true,
      exclude: ['node_modules', '.git', '.gemini/workspaces/profiles'] 
  });
  await provider.sync(path.join(EXTENSION_ROOT, 'policies/workspace-policy.toml'), `${POLICIES_PATH}/workspace-policy.toml`, { sudo: true });

  // 2. Link Extension inside the shared container
  console.log('🔗 Linking extension in remote container...');
  // We run this inside the maintainer-worker as the 'node' user so it updates the shared /home/node/.gemini/extension-enablement.json
  await provider.exec(`sudo docker exec -u node maintainer-worker gemini extensions link ${EXTENSION_REMOTE_PATH}`);

  // 3. Initialize Remote Gemini Config with Auth
  console.log('⚙️  Initializing remote Gemini configuration...');
  
  // NEW: Sync local theme and UI preferences
  let localTheme = 'Shades Of Purple';
  let useAlternateBuffer = true;
  let useBackgroundColor = true;

  if (fs.existsSync(localSettingsPath)) {
      try {
          const localSettings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf8'));
          localTheme = localSettings.ui?.theme || localTheme;
          useAlternateBuffer = localSettings.ui?.useAlternateBuffer ?? useAlternateBuffer;
          useBackgroundColor = localSettings.ui?.useBackgroundColor ?? useBackgroundColor;
      } catch (e) {}
  }

  const remoteSettings: any = {
    security: {
      auth: {
        selectedType: authStrategy
      },
      folderTrust: {
        enabled: false
      }
    },
    ui: {
      theme: localTheme,
      useAlternateBuffer,
      useBackgroundColor,
    },
    general: {
      enableAutoUpdate: false
    }
  };
  
  const tmpSettingsPath = path.join(os.tmpdir(), `remote-settings-${Date.now()}.json`);
  fs.writeFileSync(tmpSettingsPath, JSON.stringify(remoteSettings, null, 2));
  
  // Ensure the remote config dir exists before syncing
  await provider.exec(`sudo mkdir -p ${CONFIG_DIR} && sudo chmod 777 ${CONFIG_DIR}`);
  await provider.sync(tmpSettingsPath, `${CONFIG_DIR}/settings.json`, { sudo: true });
  await provider.exec(`sudo chown -R 1000:1000 ${CONFIG_DIR}`);
  fs.unlinkSync(tmpSettingsPath);

  // 3. Sync credentials for Google Accounts if needed
  if (authStrategy !== 'gemini-api-key' && (authStrategy === 'google_accounts' || authStrategy === 'oauth-personal')) {
      if (fs.existsSync(path.join(env.HOME || '', '.gemini/google_accounts.json'))) {
        await provider.sync(path.join(env.HOME || '', '.gemini/google_accounts.json'), `${CONFIG_DIR}/google_accounts.json`, { sudo: true });
        console.log('   ✅ Synchronized Google Accounts credentials.');
      }
  }

  if (githubToken) {
    // Ensure we remove any directory that might have been accidentally created with this name
    await provider.exec(`sudo rm -rf ${WORKSPACES_ROOT}/.gh_token && echo ${githubToken} | sudo tee ${WORKSPACES_ROOT}/.gh_token > /dev/null && sudo chmod 644 ${WORKSPACES_ROOT}/.gh_token && sudo chown 1000:1000 ${WORKSPACES_ROOT}/.gh_token`);
    console.log('   ✅ Uploaded GitHub PAT to remote worker.');
  }

  // Final Repo Sync
  // Final Repo Sync
  console.log(`🚀 Finalizing Remote Repository (${userFork})...`);
  const repoUrl = `https://github.com/${userFork}.git`;
  const repoPath = MAIN_REPO_PATH;

  const setupRepoCmd = `
    if [ ! -d "${repoPath}/.git" ]; then
      sudo rm -rf ${repoPath} && \
      sudo git clone --quiet -c core.filemode=false ${repoUrl} ${repoPath} && \
      sudo git -C ${repoPath} config --local safe.directory ${repoPath} && \
      sudo git -C ${repoPath} config --replace-all core.filemode false && \
      sudo git -C ${repoPath} remote add upstream ${UPSTREAM_REPO_URL}
    fi && \
    sudo git -C ${repoPath} -c safe.directory='*' fetch --quiet upstream && \
    sudo git -C ${repoPath} -c safe.directory='*' worktree prune && \
    sudo chown -R 1000:1000 ${WORKSPACES_ROOT}
  `;
  await provider.exec(setupRepoCmd);

  console.log('\n✨ ALL SYSTEMS GO! Your Gemini Workspace is ready.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSetup().catch(console.error);
}
