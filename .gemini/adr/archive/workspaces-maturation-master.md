# Master Plan: Hardening & Maturing Gemini Orbits

This document outlines the detailed sub-plans for improving the Gemini Orbits
extension based on the recent architectural audit.

---

## 🛡️ Sub-Plan A: Security & Secret Hardening

**Objective:** Eliminate secret leakage in process lists and tighten the agent's
permission boundaries.

### Tasks

1.  **Secret Injection Refactor**:
    - Modify `orchestrator.ts` to pass `GITHUB_TOKEN` and `GEMINI_API_KEY` via a
      temporary file inside the container (e.g., `/dev/shm/secrets.env`) instead
      of `-e` environment flags in `docker exec`.
    - Ensure the temporary file is deleted immediately after the session starts.
2.  **Granular Policy Enforcement**:
    - Audit `orbit-policy.toml`.
    - Remove broad `git ` and `gh ` prefixes from the "Core Utilities" section.
    - Ensure every allowed command is explicitly whitelisted (e.g., `git log`,
      `git status`, `gh pr view`).
3.  **Auth Failure Circuit Breaker**:
    - Update the `ghLoginCmd` to exit the session immediately if `gh auth login`
      fails, preventing the user from entering a "broken" session.

---

## 🎯 Sub-Plan B: Accuracy & Reliability

**Objective:** Ensure a "clean room" environment for every session and handle
edge cases in worktree management.

### Tasks

1.  **Atomic Worktree Pre-flight**:
    - Update `orchestrator.ts` to run `git worktree prune` and
      `git submodule foreach --recursive git clean -ffdx` inside the container
      before attempting to create a new worktree.
2.  **Metadata Validation**:
    - Add a check to verify that the `main` repository's `.git/worktrees`
      directory is in sync with the actual directories on disk before
      provisioning.
3.  **Orbit Doctor Skill**:
    - Introduce a hidden "doctor" check in `entrypoint.ts` that verifies path
      consistency and disk space before dropping the user into the TUI.

---

## 🏗️ Sub-Plan C: Code Quality & Refactoring

**Objective:** Reduce logic duplication and improve maintainability through
better abstraction.

### Tasks

1.  **Centralized Constants**:
    - Create `scripts/Constants.ts` to store canonical paths like
      `WORKSPACES_ROOT` (`/mnt/disks/data`), `MAIN_REPO_PATH`, and `CONFIG_DIR`.
    - Update all scripts to import from this central source.
2.  **Settings Type Safety**:
    - Define a formal `OrbitConfig` TypeScript interface.
    - Replace all `any` usages in `setup.ts` and `orchestrator.ts` with typed
      config objects.
3.  **Orchestrator Modularization**:
    - Break the 300+ line `orchestrator.ts` into smaller modules:
      `ArgumentRegistry`, `RemoteProvisioner`, and `ItermDriver`.

---

## ⚡ Sub-Plan D: Speed & Performance

**Objective:** Minimize the time from "command issued" to "interactive prompt
ready."

### Tasks

1.  **Delta Sync Implementation**:
    - Update `setup.ts` to use `rsync --checksum` or specific file filters to
      avoid re-syncing the entire `scripts/` folder if no changes were made
      locally.
2.  **Container Warm-up**:
    - Refine `GceCosProvider.ts` to perform "lazy" image pulls or background
      refreshes to keep the `development-worker` ready without blocking the main
      orchestration flow.
3.  **SSH Multiplexing**:
    - Enable SSH connection sharing (`ControlMaster`) in the generated
      `ssh_config` to reduce the overhead of multiple `provider.exec` calls.

---

## 🧪 Sub-Plan E: Isolation & Worker Hardening

**Objective:** Ensure that autonomous agent loops cannot interfere with the
user's interactive state.

### Tasks

1.  **Environment Separation**:
    - Ensure that the background `worker.ts` runs with a distinct
      `GEMINI_CLI_HOME` or temporary profile compared to the interactive
      session.
2.  **Resource Limiting**:
    - Investigate adding `docker` resource limits (`--memory`, `--cpus`) to the
      `development-worker` container to prevent a runaway agentic loop from
      freezing the host VM.
