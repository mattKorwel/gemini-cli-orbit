# Gemini Workspaces: End-to-End Test Plan (v1.3)

This document provides a structured protocol for validating the **Workspaces** platform (v1.3+). It focuses on multi-repository support, the `WorkerProvider` abstraction, and stable policy discovery.

---

## 🤖 LLM-First Verification Protocol
When asked to "Run the End-to-End Test Plan," the agent should follow these steps and report the outcome for each.

### 📁 1. Multi-Repo Discovery & Migration
**Goal**: Verify the system correctly identifies the current repo and migrates legacy settings.

1.  **Input**: Run `npx tsx scripts/ConfigManager.ts` (or use a test helper) in a repo with a legacy `settings.json`.
2.  **Expected Output**:
    - [ ] Log message: `🔄 Migrating legacy configuration format...`
    - [ ] `settings.json` now contains a `repos` map.
    - [ ] `activeRepo` matches the current `gh repo view` name.
3.  **Command**: `npx tsx scripts/setup.ts --skip-config`
    - [ ] Output contains: `✅ Existing configuration found for repo: <REPO_NAME>`

### 🏗️ 2. Provider-Based Provisioning (COS)
**Goal**: Verify the `GceCosProvider` correctly handles infrastructure lifecycle.

1.  **Input**: `npx tsx scripts/fleet.ts provision`
2.  **Expected Output**:
    - [ ] Log: `🚀 Provisioning GCE COS worker: gcli-workspace-<user>...`
    - [ ] `gcloud compute instances describe` shows status `RUNNING`.
    - [ ] Internal/External IPs are resolved and stored in the provider state.

### 🛡️ 3. Policy Discovery (Tier 3)
**Goal**: Ensure `ALLOW` rules are active without `[PolicyConfig]` noise.

1.  **Input**: Start a fresh Gemini session: `gemini`
2.  **Expected Output**:
    - [ ] **NO** lines containing `[PolicyConfig] Extension "workspaces" attempted to contribute...`.
    - [ ] Command `gh auth status` (or any `ALLOW`ed git/npm command) executes without an interactive security prompt.

### 🔗 4. Cross-Repo Isolation
**Goal**: Verify that PR workspaces for different repos are isolated on the same worker.

1.  **Input**: 
    - In Repo A (e.g., `gemini-cli`): `workspace open 101`
    - In Repo B (e.g., `workspaces-extension`): `workspace open 5`
2.  **Expected Output**:
    - [ ] Container A: `gcli-101-open` (Running in `/mnt/disks/data/worktrees/gemini-cli/...`)
    - [ ] Container B: `gcli-5-open` (Running in `/mnt/disks/data/worktrees/workspaces-extension/...`)
    - [ ] `workspace status` lists both containers under their respective repo headers.

### 🛰️ 5. Mission Control (Supervisor View)
**Goal**: Verify the new `listContainers` and `capturePane` logic.

1.  **Input**: `npx tsx scripts/status.ts`
2.  **Expected Output**:
    - [ ] Header: `🛰️ Workspace Mission Control: <INSTANCE_NAME> (<REPO_NAME>)`
    - [ ] Section: `📦 Active Workspace Environments:`
    - [ ] For an active container: `✋ [WAITING]` if a prompt is detected, or `🧠 [THINKING]` if the agent is active.

### 🧹 6. Surgical Cleanup
**Goal**: Verify repo-aware cleanup.

1.  **Input**: `npx tsx scripts/clean.ts 101 open` (while in Repo A)
2.  **Expected Output**:
    - [ ] `gcli-101-open` is removed.
    - [ ] `/mnt/disks/data/worktrees/gemini-cli/workspace-101-open` is deleted.
    - [ ] **Repo B's** `gcli-5-open` remains untouched.

---

## 🛠️ Automated Verification Script
You can run this snippet to check the core contract:
```bash
# Verify Config Migration
node -e "const cm = require('./scripts/ConfigManager'); console.log('Repo:', cm.detectRepoName())"

# Verify Provider Interface
node -e "const pf = require('./scripts/providers/ProviderFactory'); const p = pf.ProviderFactory.getProvider({projectId:'p', zone:'z', instanceName:'i'}); console.log('Provider:', p.constructor.name)"

# Run Unit Tests
npm test
```
