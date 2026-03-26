# Gemini Orbits: End-to-End Test Plan (v1.4)

This document provides a structured protocol for validating the **Orbits** platform (v1.4+). It focuses on the tiered settings hierarchy, global profiles, and GitHub team variable integration.

---

## 🤖 LLM-First Verification Protocol

### 📁 1. Tiered Configuration & Migration
**Goal**: Verify the system merges Project Defaults, Global Registry, Profiles, and Env Vars correctly.

1.  **Input**: 
    - Create a dummy profile: `~/.gemini/orbits/profiles/test.json` with `{"projectId": "profile-p"}`.
    - Set an env var: `export GCLI_WORKSPACE_PROJECT_ID=env-p`.
2.  **Expected Output**:
    - [ ] `resolveConfig()` returns `env-p` (Env Var has highest priority).
3.  **Migration Check**:
    - [ ] Place a legacy `settings.json` in `.gemini/orbits/`.
    - [ ] Run `orbit status`.
    - [ ] Verify settings are moved to `~/.gemini/orbits/settings.json` and deleted from the local folder.

### 🏗️ 2. Zero-Touch Infrastructure (Profiles)
**Goal**: Verify automatic profile handling.

1.  **Input**: Run `orbit setup` with no existing profiles.
2.  **Expected Output**:
    - [ ] Log: `✨ No profiles found. Creating "default" profile...`
    - [ ] File created: `~/.gemini/orbits/profiles/default.json`.
    - [ ] Settings stored: Infrastructure keys (GCP Project, VPC) go into the **Profile**; Repository links go into the **Global Registry**.

### 🔐 3. GitHub Team Config
**Goal**: Verify shared team variables are used as a fallback.

1.  **Input**: 
    - Set a GitHub repo variable: `gh variable set GCLI_VPC_NAME --body "shared-vpc"`.
    - Ensure no VPC is set in local profiles/settings.
2.  **Expected Output**:
    - [ ] `orbit setup` detects "shared-vpc" as the default.
    - [ ] `resolveConfig()` includes `vpcName: "shared-vpc"`.

### 🛰️ 4. Mission Control (Supervisor View)
**Goal**: Verify the new "Thinking/Waiting" agent detection.

1.  **Input**: `orbit status`
2.  **Expected Output**:
    - [ ] Correctly identifies the supervisor for the repo.
    - [ ] For an active PR: Displays `🧠 [THINKING]` if the agent is processing.

---

## 🛠️ Automated Verification Script
```bash
# Verify Resolution Hierarchy
node -e "const cm = require('./scripts/ConfigManager'); console.log('Resolved Config:', cm.getRepoConfig())"

# Verify GitHub Variable Access
gh variable get GCLI_PROJECT_ID || echo "No team variables set on GitHub"

# Run Unit Tests
npm test
```
