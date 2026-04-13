# Empirical Validation Plan: Mission Control & Station Integrity 🛰️

## Objective

Systematically verify the end-to-end lifecycle of Local and Remote missions
across multiple repositories. This plan prioritizes the "Mission -> Pulse ->
Repeat" cycle to ensure accurate state tracking, receipt integrity, and zero
data duplication.

## 📋 Phase 1: Local Baseline (gemini-cli-orbit)

**Goal**: Verify a clean local mission cycle in the extension repository.

1.  **Launch Mission**:
    - `orbit mission launch local-orbit --local --action chat`
2.  **Pulse Verification**:
    - [ ] `orbit constellation --pulse --verbose` shows `local-gemini-cli-orbit`
          station.
    - [ ] Capsule `gemini-cli-orbit/local-orbit` is listed under the local
          station.
3.  **Receipt Verification**:
    - [ ] `cat ~/.gemini/orbit/stations/local-gemini-cli-orbit.json` exists.
    - [ ] Receipt `type` is `local-worktree` and `repo` is `gemini-cli-orbit`.
4.  **Disk Verification**:
    - [ ] `~/dev/gemini-cli-orbit/orbit-git-worktrees/local-orbit` exists.
    - [ ] `.gemini/orbit/state.json` in the worktree has correct `identifier`
          and `sessionName`.
5.  **Cleanup**:
    - `orbit mission jettison local-orbit`
    - [ ] **Verification**: `orbit constellation --pulse` shows no active
          capsules.
    - [ ] **Verification**: Worktree directory is removed.

---

## 🏗️ Phase 2: Remote Baseline (orbit-test-server)

**Goal**: Verify the fix for station naming, remote pathing, and receipt
integrity.

1.  **Liftoff**:
    - `orbit infra liftoff orbit-test-server --schematic korwel-orbit-fresh`
2.  **Receipt Verification**:
    - [ ] `cat ~/.gemini/orbit/stations/orbit-test-server.json` exists.
    - [ ] Receipt contains `instanceName: "orbit-test-server"` and
          `name: "orbit-test-server"`.
    - [ ] Receipt `type` is `gce` and `repo` is `gemini-cli-orbit`.
3.  **Launch Remote Mission**:
    - `orbit mission launch remote-orbit --action chat --for-station orbit-test-server`
4.  **Pulse Verification**:
    - [ ] `orbit constellation --pulse --verbose` shows
          `REMOTE STATION: orbit-test-server`.
    - [ ] Internal IP `10.128.0.2` is correctly reported.
    - [ ] Capsule `gemini-cli-orbit/remote-orbit` is listed under the remote
          station.
5.  **Disk Verification (Remote)**:
    - [ ] `/mnt/disks/data/workspaces/gemini-cli-orbit/remote-orbit` exists on
          the GCE instance.
    - [ ] Capsule `state.json` reports matching identifiers.
6.  **Cleanup**:
    - `orbit mission jettison remote-orbit`
    - [ ] **Verification**: `orbit constellation --pulse` shows no active
          capsules.

---

## 🎭 Phase 3: Multi-Repo & Shared Station Integrity

**Goal**: Ensure a single station can host missions from different repositories
without path collisions or receipt corruption.

1.  **Launch Multi-Repo Mission**:
    - Navigate to `~/dev/gemini-cli/main`.
    - `orbit mission launch cli-chat --action chat --for-station orbit-test-server`
2.  **Receipt Verification**:
    - [ ] `cat ~/.gemini/orbit/stations/orbit-test-server.json` is inspected.
    - [ ] **Critical**: Does the `repo` field in the receipt update to
          `gemini-cli` or remain stable? (Expected: Should support shared
          usage).
3.  **Pulse Verification**:
    - [ ] Pulse shows TWO repo contexts: `gemini-cli-orbit` and `gemini-cli`.
    - [ ] `orbit-test-server` is listed under both repo headers.
    - [ ] Capsules are correctly attributed to their respective repositories.
4.  **Cross-Repo Cleanup**:
    - `orbit mission jettison cli-chat`
    - [ ] **Verification**: `orbit constellation --pulse` shows no active
          capsules for `gemini-cli`.

---

## 🌊 Phase 4: Global Integrity & Splashdown

**Goal**: Verify clean decommissioning of all resources.

1.  **Final Pulse**:
    - [ ] `orbit constellation --pulse --verbose` must be empty of active
          capsules.
2.  **Splashdown**:
    - `orbit infra splashdown orbit-test-server`
3.  **Verification**:
    - [ ] `~/.gemini/orbit/stations/orbit-test-server.json` is deleted.
    - [ ] Pulumi stack for `orbit-test-server` is destroyed.

---

## 🛡️ Security & State Audit

1.  **RAM-disk secret mount (ADR 14)**:
    - [ ] Verify `/dev/shm/.orbit-env-*` exists on host while mission is active.
    - [ ] Verify capsule mounts this at `/.env`.
2.  **Path Parity**:
    - [ ] Verify host and capsule both use `/mnt/disks/data` for Git metadata
          consistency.
