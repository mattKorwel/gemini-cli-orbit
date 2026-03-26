# Gemini Workspaces: End-to-End Test Plan (v1.2)

This document provides a structured protocol for validating the Gemini Workspaces system. It ensures that infrastructure, networking, and automated supervisor loops are functioning correctly after refactors.

---

## 🏗️ 1. Zero-Touch Infrastructure (Headless & Profiles)
**Goal**: Verify that the global profile system and headless flags provide a perfectly automated setup.

### Test Scenario: Headless "Day 0" Setup
1.  **Preparation**: Ensure you have a valid profile saved in `~/.gemini/workspaces/profiles/corp.json`.
2.  **Reset**: `npx tsx scripts/fleet.ts destroy`
3.  **Command**: 
    ```bash
    npx tsx scripts/setup.ts --profile=corp --yes --reconfigure
    ```
4.  **Pass Criteria**:
    - [ ] Script resolves "corp" to the global path automatically.
    - [ ] No interactive prompts appear (no hangs on empty defaults).
    - [ ] VM is provisioned and waits for stabilization loop (~45-60s).
    - [ ] Returns exit code `0` on completion.

---

## 📡 2. Connectivity Backends (Network Path Validation)
**Goal**: Verify that all three connectivity modes (`direct-internal`, `iap`, `external`) correctly route traffic.

### Test Scenario: IAP Tunneling (VPC-Off)
1.  **Setup**: Reconfigure a profile to use `backendType: "iap"`.
2.  **Command**: `/workspace:status`
3.  **Pass Criteria**:
    - [ ] Status command succeeds without being on a Corporate VPN.
    - [ ] Logs show usage of `gcloud compute ssh --tunnel-through-iap`.

### Test Scenario: Magic DNS (VPC-On)
1.  **Setup**: Reconfigure to `backendType: "direct-internal"` with `dnsSuffix: ".gcpnode.com"`.
2.  **Pass Criteria**:
    - [ ] Connection string matches: `user_google_com@nic0.<instance>.<zone>.c.<project>.internal.gcpnode.com`.

---

## 🔗 3. Remote Environment Integrity (Sync & Link)
**Goal**: Confirm the supervisor has the latest extension logic and ported skills.

1.  **Command**: Exec into the worker after setup.
    ```bash
    # From local machine
    gcloud compute ssh development-worker --project <ID> --zone <ZONE> --tunnel-through-iap
    # Inside VM
    sudo docker exec -it development-worker gemini extensions list
    ```
2.  **Pass Criteria**:
    - [ ] `workspaces@1.1.0` is listed as a linked extension.
    - [ ] The command `/workspace:review` is available inside the remote container.

---

## 🧵 4. Isolated PR Workspaces (Containers & Worktrees)
**Goal**: Verify process-level isolation and reference-clone speed.

1.  **Command**: `/workspace:open 23176`
2.  **Pass Criteria**:
    - [ ] Container `gcli-23176-open` is created using the configured `imageUri`.
    - [ ] Checkout is instantaneous (< 5s) via `--reference` clone.
    - [ ] `.env` file inside the container contains the correct `GEMINI_API_KEY` and `GEMINI_HOST`.

---

## 🛰️ 5. Monitoring & Status
**Goal**: Verify the Mission Control dashboard and persistence.

1.  **Command**: `/workspace:status`
2.  **Pass Criteria**:
    - [ ] Lists the `development-worker` as the supervisor.
    - [ ] Lists active PR containers.
    - [ ] Correctly shows if a container has an active `tmux` session.

---

## 🧹 6. Cleanup & Reset
**Goal**: Verify surgical and bulk cleanup.

1.  **Surgical**: `/workspace:clean 23176 open`
    - [ ] Container is gone.
    - [ ] Worktree directory `/mnt/disks/data/worktrees/workspace-23176-open` is deleted.
2.  **Bulk**: `/workspace:clean --all`
    - [ ] Every non-root file on the persistent disk is wiped.
    - [ ] Every `gcli-*` container is removed.

---

## 🛡️ 7. Robustness & Error Codes
**Goal**: Ensure failures are properly signaled for automation.

1.  **Failure Test**:
    - Stop the VM manually via Cloud Console.
    - Run `/workspace:status`.
2.  **Pass Criteria**:
    - [ ] Script prints a clear error message.
    - [ ] Script returns exit code `1` (verify with `echo $?`).
