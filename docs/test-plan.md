# Gemini Orbit: End-to-End Test Plan (v1.6)

This document provides a structured protocol for validating the **Orbit** platform (v1.6+). It ensures that decoupled Designs, bundled scripts, and surgical updates are fully functional.

---

## 📋 Pre-Flight: Manual Design Verification
**Goal**: Ensure the global environment is correctly seeded before running automated tests.

1.  **Check Global Directory**:
    - [ ] `ls -d ~/.gemini/orbit` exists.
    - [ ] `ls ~/.gemini/orbit/profiles` contains at least one `.json` design (e.g., `default.json`, `corp.json`).
2.  **Verify Design Content**:
    - [ ] Open a design (e.g., `cat ~/.gemini/orbit/profiles/corp.json`).
    - [ ] Ensure it contains valid infrastructure keys: `projectId`, `zone`, `machineType`, `vpcName`, `subnetName`, and `backendType`.
3.  **Verify Global Registry**:
    - [ ] `cat ~/.gemini/orbit/settings.json` exists.
    - [ ] `activeProfile` points to a valid design name.
    - [ ] `repos` contains a link for the current repository.

---

## ⚙️ 1. Core Integrity (Automated)
**Goal**: Verify build, bundle, and basic logic integrity.

1.  **Build & Bundle**:
    - `npm run build`
    - [ ] `bundle/` is populated with ESM `.js` files.
    - [ ] No `.test.js` files are present in `bundle/`.
2.  **Linting**:
    - `npm run lint`
    - [ ] Output is clean (0 errors, 0 warnings).
3.  **Unit Tests**:
    - `npm test`
    - [ ] All 40+ tests pass across all providers and strategies.
4.  **Documentation Sync**:
    - `npm run sync-docs`
    - [ ] `docs/CONFIGURATION.md` is updated with the latest code snippets.

---

## 🎚️ 2. Tiered Configuration & Surgical Mode
**Goal**: Verify the system merges Project Defaults, Global Registry, Designs, and Env Vars correctly.

### 2.1 Resolution Hierarchy
1.  **Input**: 
    - Create a temporary test design: `echo '{"projectId": "design-p"}' > ~/.gemini/orbit/profiles/test-resolution.json`.
    - Set an env var: `export GCLI_ORBIT_PROJECT_ID=env-p`.
2.  **Automated Check**:
    - `node -e "import { getRepoConfig } from './bundle/ConfigManager.js'; console.log(getRepoConfig('gemini-cli').projectId)"`
    - [ ] **Expected**: `env-p` (Environment variables have the highest priority).

### 2.2 Surgical Updates
1.  **Input**: Run `orbit liftoff --gce-machine-type=n2-highmem-16` (using the bundled script).
2.  **Expected Output**:
    - [ ] The script should **NOT** prompt for confirmation (Surgical Mode).
    - [ ] `~/.gemini/orbit/settings.json` is updated with the new machine type for the current repo.

---

## 🛰️ 3. Remote Mission Control (Manual/Cloud)
**Goal**: Verify connectivity and orchestration with the latest developer image.

### 3.1 Station Liftoff (GCE)
1.  **Input**: `node bundle/setup.js --reconfigure`
2.  **Expected Output**:
    - [ ] Correctly identifies the `upstreamRepo` and `userFork`.
    - [ ] Prompts for **Design** selection.
    - [ ] Successfully provisions/wakes the GCE station.

### 3.2 Connectivity Backends
1.  **IAP (Secure Tunnel)**:
    - Set `backendType: "iap"` in a design.
    - [ ] `node bundle/status.js` connects successfully without a public IP.
2.  **Direct Internal (VPC)**:
    - Set `backendType: "direct-internal"` in a design.
    - [ ] `node bundle/status.js` uses the `.internal` or `.gcpnode.com` DNS name.

---

## 🧹 4. Mission Cleanup
**Goal**: Ensure surgical and global cleanup works as intended.

1.  **Jettison (PR-specific)**:
    - [ ] `node bundle/jettison.js <PR_NUMBER>` removes the specific capsule and its worktree.
2.  **Splashdown (Global)**:
    - [ ] `node bundle/splashdown.js --all` terminates the station supervisor and clears all remote resources.

---

## 🛠️ Automated Verification Suite
Run this suite to perform a high-level health check:
```bash
# Full Build & Test
npm run build && npm test

# Verify Resolution Hierarchy (Requires 'test-resolution' design)
node -e "import { getRepoConfig } from './bundle/ConfigManager.js'; console.log('Resolved Project:', getRepoConfig().projectId)"

# Verify GitHub Variable Access
gh variable get GCLI_PROJECT_ID || echo "No team variables set on GitHub"
```
