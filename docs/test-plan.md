# Gemini Orbit: End-to-End Test Plan (v6.0)

This document provides a structured protocol for validating the **Orbit**
platform (v6.0+). It ensures that decoupled Schematics, hardened security, and
phased autonomous maneuvers are fully functional.

---

## 📋 Pre-Flight: Manual Schematic Verification

**Goal**: Ensure the global environment is correctly seeded before running
manual or automated tests.

1.  **Check Global Directory**:
    - [ ] `ls -d ~/.gemini/orbit` exists.
    - [ ] `ls ~/.gemini/orbit/schematics` contains at least one `.json`
          schematic (e.g., `default.json`, `corp.json`).
2.  **Verify Schematic Content**:
    - [ ] Open a schematic (e.g., `cat ~/.gemini/orbit/schematics/corp.json`).
    - [ ] Ensure it contains valid infrastructure keys: `projectId`, `zone`,
          `machineType`, `vpcName`, `subnetName`, and `backendType`.
3.  **Verify Global Registry**:
    - [ ] `cat ~/.gemini/orbit/settings.json` exists.
    - [ ] `activeStation` points to a valid station name.

---

## 🛡️ 1. Security & Integrity (High Priority)

**Goal**: Verify that sensitive credentials and paths are protected.

### 1.1 Path Traversal Prevention

1.  **Input**: `orbit schematic edit ../../malicious`
2.  **Expected**: The name should be sanitized to `------malicious` and saved
    safely within the `schematics/` directory, or rejected.
3.  **Input**: `orbit schematic import https://example.com/bad.json` (where
    `bad.json` has `schematicName: "../../bad"`)
4.  **Expected**: Sanitized name `------bad` used for the local file.

### 1.2 RAM-based Credential Injection (ADR 14)

1.  **Input**: Launch a remote mission: `orbit mission <PR> review`.
2.  **Verification (On Remote Station, while mission is actively running)**:
    - [ ] `ls /dev/shm/.gcli-env-*` exists on the Host VM (file is present while
          mission is active; automatically cleaned up when mission exits).
    - [ ] `cat /mnt/disks/data/worktrees/mission-<ID>/.env` **DOES NOT** exist
          (or does not contain the API Key).
    - [ ] `docker inspect gcli-<ID>-review` shows the mount:
          `Source: /dev/shm/.gcli-env-<ID>, Destination: /mnt/disks/data/worktrees/mission-<ID>/.env, ReadOnly: true`.
3.  **Post-mission cleanup verification**:
    - [ ] After the mission exits, `ls /dev/shm/.gcli-env-*` should return no
          results — file is cleaned up in the `finally` block.

### 1.3 Schematic Schema Validation

1.  **Input**: Create a dummy JSON missing `projectId`:
    `echo '{"zone":"us-central1-a"}' > /tmp/bad.json`.
2.  **Action**: `orbit schematic import /tmp/bad.json`
3.  **Expected**: Fails with "Schematic is missing required infrastructure
    fields".

---

## ⚙️ 2. Core Integrity & Terminology

**Goal**: Verify build, bundle, and basic logic integrity.

1.  **Build & Bundle**:
    - `npm run build`
    - [ ] `bundle/` is populated with ESM `.js` files.
2.  **Terminology Sync**:
    - [ ] `orbit pulse` shows the "ORBIT PULSE" header.
    - [ ] `orbit schematic list` works.
3.  **Unit Tests**:
    - `npm test`
    - [ ] All 83+ tests pass across all providers and strategies.

---

## 🎚️ 3. Tiered Configuration & Local Missions

**Goal**: Verify the system merges Project Defaults, Global Registry,
Schematics, and Env Vars correctly.

### 3.1 Resolution Hierarchy

1.  **Input**: `orbit pulse --for-station=my-custom-station`
2.  **Expected**: Pulse attempts to connect to `my-custom-station` even if
    another station is marked active in settings.

### 3.2 Local Mission Maneuvers

1.  **Input**: `orbit mission <PR_NUMBER> review --local`
2.  **Expected Behavior**:
    - [ ] Creates a sibling worktree in your project's parent directory.
    - [ ] Launches a persistent `tmux` session named `orbit-<branch>`.
    - [ ] Successfully executes the "Review" maneuver phases (Phase 0, 1, 2).

---

## 🛰️ 4. Remote Mission Control (Cloud)

**Goal**: Verify connectivity and orchestration on a GCE Station.

### 4.1 Station Liftoff

1.  **Input**: `orbit station liftoff corp --setup-net` (using a schematic named
    'corp').
2.  **Expected Output**:
    - [ ] Provisions/wakes the GCE station defined in the 'corp' schematic.
    - [ ] Sets the 'activeStation' in global settings.

### 4.2 Autonomous Maneuvers (Remote)

1.  **Input**: `orbit mission <PR> review`
2.  **Verification**:
    - [ ] `orbit uplink <PR>` allows you to watch the phased execution.
    - [ ] `orbit pulse` shows the mission as `🧠 [THINKING]` during execution.
    - [ ] `orbit pulse` shows the mission as `✋ [WAITING]` if it requires
          approval or input.

---

## 🧹 5. Mission Cleanup

**Goal**: Ensure surgical and global cleanup works as intended.

1.  **Jettison**: `orbit jettison <PR>`
    - [ ] Removes the remote Docker capsule.
    - [ ] Removes the remote Git worktree.
2.  **Splashdown**: `orbit splashdown --all`
    - [ ] Terminates the GCE station.
    - [ ] Clears the active station pointer.

---

## 🛠️ Automated Health Check

```bash
# Full Build & Test
npm run build && npm test

# Verify Pulse CLI (bin/ directory removed in Release 6 — use orbit CLI)
orbit pulse

# Verify Schematic Management
orbit schematic list
```
