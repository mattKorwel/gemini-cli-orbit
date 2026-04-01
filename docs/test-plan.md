# Gemini Orbit: End-to-End Test Plan

This document provides a structured protocol for validating the **Orbit** platform. It ensures that declarative PNI (Pulumi-Native Infrastructure), decoupled providers, and the modern `src/` architecture are fully functional.

---

## 📋 Pre-Flight: Environment Verification

**Goal**: Ensure the global environment is correctly seeded before running tests.

1.  **Check Global Directory**:
    - [ ] `ls -d ~/.gemini/orbit` exists.
    - [ ] `ls ~/.gemini/orbit/schematics` contains at least one `.json` schematic.
2.  **Verify Managed Binaries**:
    - [ ] `ls ~/.gemini/orbit/bin/pulumi` contains the managed Pulumi binary (if installed).
3.  **Verify Global Registry**:
    - [ ] `cat ~/.gemini/orbit/settings.json` exists.

---

## 🛡️ 1. Security & Integrity

**Goal**: Verify that sensitive credentials and paths are protected.

### 1.1 Path Traversal Prevention
1.  **Input**: `orbit schematic edit ../../malicious`
2.  **Expected**: The name is sanitized to `------malicious` and saved safely within the `schematics/` directory.

### 1.2 RAM-based Credential Injection (ADR 14)
1.  **Input**: Launch a remote mission: `orbit mission <PR> review`.
2.  **Verification (On Remote Station)**:
    - [ ] `ls /dev/shm/.gcli-env-*` exists while mission is active.
    - [ ] `docker inspect gcli-<ID>-review` shows the RAM-disk mount at `/.env`.
3.  **Post-mission**: File is automatically purged from RAM.

---

## ⚙️ 2. Core Integrity & Build

**Goal**: Verify build, bundle, and basic logic integrity.

1.  **Build & Bundle**:
    - `npm run build:bundle`
    - [ ] `bundle/` is populated with ESM `.js` files using the new `src/` paths.
2.  **Unit Tests**:
    - `npm test`
    - [ ] All **118+ tests** pass across all core modules and providers.
3.  **Type Safety**:
    - `npm run typecheck`
    - [ ] Completes with 0 errors.

---

## 🎚️ 3. Local Missions (Docker-Free)

**Goal**: Verify that local missions use native Git worktrees without Docker terminology.

1.  **Worktree Creation**:
    - `orbit mission <PR> --local`
    - [ ] Successfully creates a sibling worktree in the `worktrees/` directory.
2.  **Tracking**:
    - `orbit pulse --local`
    - [ ] Correct identifies the local worktree as an active mission.

---

## 🛰️ 4. Declarative Infrastructure (PNI)

**Goal**: Verify connectivity and orchestration using the Pulumi-managed layer.

### 4.1 Dependency Management
1.  **Action**: Move `~/.gemini/orbit/bin/pulumi` to a backup location.
2.  **Input**: `orbit liftoff`
3.  **Expected**: Orbit detects missing Pulumi and explicitly prompts for local installation.

### 4.2 Cloud Liftoff
1.  **Input**: `orbit liftoff <schematic>`
2.  **Expected Behavior**:
    - [ ] Initializes local state backend (`pulumi login --local`).
    - [ ] Provisions/wakes the Station VM.
    - [ ] Hands over the discovered IP to the execution provider.

### 4.3 Cleanup
1.  **Input**: `orbit liftoff --destroy`
2.  **Expected Behavior**: Pulumi successfully decommissions the cloud resources defined in the schematic.

---

## 🛸 5. Autonomous Maneuvers

**Goal**: Ensure playbooks function with the new Yargs command routing.

1.  **Uplink**: `orbit uplink <PR>` correctly surfaces mission logs.
2.  **Jettison**: `orbit jettison <PR> --yes` removes resources without interaction.
3.  **Reap**: `orbit reap --threshold=2` identifies idle capsules based on the provided flag.
