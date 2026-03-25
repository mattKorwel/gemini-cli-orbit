# Gemini Workspaces: End-to-End Test Plan

This document provides a structured protocol for validating the Gemini Workspaces system after architectural changes.

---

## 🏗️ 1. Infrastructure & Setup
**Goal**: Verify that a "from zero" setup correctly provisions networking, storage, and the worker VM.

1.  **Full Reset**:
    - Run: `npx tsx scripts/fleet.ts destroy`
    - Verify: Instance and static IP are removed from GCP console.
2.  **Fresh Setup**:
    - Run: `npx tsx scripts/setup.ts --reconfigure`
    - Verify:
        - [ ] Prompts for Project ID and Zone.
        - [ ] Prompts for GitHub PAT (if not in `.env`).
        - [ ] Creates `.gemini/workspaces/ssh_config` and `known_hosts`.
        - [ ] Syncs `scripts/` and `policies/` to remote.
        - [ ] Performs full clone of `main` repo on host disk.

---

## 🧵 2. Session Isolation (Multi-Container)
**Goal**: Verify that multiple PR sessions are physically isolated into separate containers.

1.  **Launch Session A**:
    - Run: `npx tsx scripts/orchestrator.ts 23176 --open tab`
    - Verify: iTerm2 tab opens, container `gcli-23176-open` is created.
2.  **Launch Session B**:
    - Run: `npx tsx scripts/orchestrator.ts 12345 --open tab`
    - Verify: Second iTerm2 tab opens, container `gcli-12345-open` is created.
3.  **Validate Isolation**:
    - Inside Session A: `touch /mnt/disks/data/worktrees/workspace-23176-open/isolation_test`
    - Inside Session B: `ls /mnt/disks/data/worktrees/workspace-23176-open/isolation_test`
    - **Pass criteria**: Session B should see "No such file or directory" (unless broad mounts are accidentally restored).
4.  **Validate Read-Only Source**:
    - Inside any session: `rm -rf /mnt/disks/data/main`
    - **Pass criteria**: Command fails with "Read-only file system".

---

## 📡 3. Persistence & Connectivity
**Goal**: Verify that tmux persistence and SSH multiplexing are working.

1.  **TMUX Survival**:
    - Open a session, start a long-running command (e.g., `sleep 100`).
    - Close the iTerm2 tab.
    - Run: `npx tsx scripts/orchestrator.ts <PR> --open foreground`
    - **Pass criteria**: You are dropped back into the *same* running session with the `sleep` command still visible.
2.  **Startup Speed**:
    - Run `workspace` for a PR that is **already running**.
    - **Pass criteria**: Connection should be nearly instant (< 2s) via SSH multiplexing and the "already active" container bypass.

---

## 🛰️ 4. Monitoring & Status
**Goal**: Verify the Mission Control dashboard.

1.  **Status Check**:
    - Run: `npx tsx scripts/status.ts`
    - **Pass criteria**:
        - Shows VM as `RUNNING`.
        - Lists all active `gcli-*` containers.
        - Correctly displays active `tmux` sessions for each container.

---

## 🧹 5. Cleanup
**Goal**: Verify surgical and bulk cleanup.

1.  **Surgical Cleanup**:
    - Run: `npx tsx scripts/clean.ts 23176 open`
    - Verify: Container `gcli-23176-open` is removed, worktree directory is deleted.
2.  **Bulk Cleanup**:
    - Run: `npx tsx scripts/clean.ts --all`
    - Verify: **ALL** worktrees, history, and containers are wiped. VM stays running but empty.
