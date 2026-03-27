# Gemini Orbit: End-to-End Test Plan (v1.4)

This document provides a structured protocol for validating the **Orbit** platform (v1.4+). It focuses on the tiered settings hierarchy, global profiles, and GitHub team variable integration.

---

## 🤖 LLM-First Verification Protocol

### 📁 1. Tiered Configuration & Migration
**Goal**: Verify the system merges Project Defaults, Global Registry, Profiles, and Env Vars correctly.

1.  **Input**: 
    - Create a dummy profile: `~/.gemini/orbit/profiles/test.json` with `{"projectId": "profile-p"}`.
    - Set an env var: `export GCLI_ORBIT_PROJECT_ID=env-p`.
2.  **Expected Output**:
    - [ ] `getRepoConfig()` returns `env-p` (Env Var has highest priority).
3.  **Migration Check**:
    - [ ] Place a legacy `settings.json` in `.gemini/orbit/`.
    - [ ] Run `orbit status`.
    - [ ] Verify settings are moved to `~/.gemini/orbit/settings.json` and deleted from the local folder.

### 🏗️ 2. Zero-Touch Infrastructure (Profiles)
**Goal**: Verify automatic profile handling.

1.  **Input**: Run `orbit setup` with no existing profiles.
2.  **Expected Output**:
    - [ ] Log: `✨ No profiles found. Creating "default" profile...`
    - [ ] File created: `~/.gemini/orbit/profiles/default.json`.
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

## 🏠 5. Local Orbit Missions (v1.5)
**Goal**: Verify local worktree and docker/podman provider isolation.

### 🌿 5.1 Local Worktree Isolation
1.  **Input**:
    - Create `~/.gemini/orbit/profiles/local.json` with `{"providerType": "local-worktree", "worktreesDir": "~/dev/orbit-test"}`.
    - Run `orbit mission 123 --profile=local`.
2.  **Expected Output**:
    - [ ] Log: `🏠 Ensuring local worktrees directory: /Users/.../dev/orbit-test`.
    - [ ] `git worktree list` shows a new worktree created in that directory.
    - [ ] Gemini agent starts inside the new worktree.

### 🐳 5.2 Local Docker/Podman
1.  **Input**: 
    - Set `providerType: "local-docker"` in a profile.
    - Run `orbit mission 123`.
2.  **Expected Output**:
    - [ ] `docker ps` shows a new `gcli-123-mission` container.
    - [ ] Agent runs inside the container with local volume mounts.

### 📟 5.3 Tmux Resilience & Fallback
1.  **Input (Resilience)**:
    - Launch `orbit mission 123`.
    - Close the terminal tab while the agent is "Thinking."
    - Run `orbit mission 123` again.
2.  **Expected Output (Resilience)**:
    - [ ] Agent resumes exactly where it left off (no restart).
3.  **Input (Fallback)**:
    - Set `useTmux: false` in `config.json` OR run in an environment without `tmux`.
4.  **Expected Output (Fallback)**:
    - [ ] Log: `⚠️ tmux not detected... Falling back to raw execution.`
    - [ ] Mission starts directly in the foreground.

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
