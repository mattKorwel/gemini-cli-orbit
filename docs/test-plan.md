# Gemini Orbit: End-to-End Validation Protocol 🛰️

This document defines the gold-standard validation flow for Gemini Orbit. It
ensures that environment setup, full-stack networking automation, and remote
mission orchestration are fully functional.

---

## 📋 Phase 1: Environment Readiness

**Goal**: Verify that a new user can initialize their environment and define a
corporate-ready blueprint.

1.  **Shell Integration**:
    - `orbit config install`
    - [x] **Verification**: `~/.zshrc` contains Orbit aliases and path exports.
2.  **Schematic Creation (Headless)**:
    - Create a schematic with BeyondCorp settings and automated networking.
    ```bash
    orbit infra schematic create corp-val \
      --projectId korwel-gcli-02-sandbox-676005 \
      --backendType direct-internal \
      --dnsSuffix internal.gcpnode.com \
      --userSuffix _google_com \
      --manageNetworking true \
      --sshSourceRanges 172.253.30.0/23 \
      --zone us-central1-a
    ```

    - [x] **Verification**: `~/.gemini/orbit/schematics/corp-val.json` contains
          the correct values and types (boolean/array).

---

## 🏗️ Phase 2: Infrastructure Gravity (PNI)

**Goal**: Verify that Orbit can manage the entire GCP networking and compute
stack idempotently.

1.  **Full-Stack Liftoff**:
    - `orbit infra liftoff val-station --schematic corp-val`
    - [x] **Verification**: Pulumi provisions VPC, Subnet, Router, NAT, and
          Firewall.
    - [x] **Verification**: VM is provisioned with a dedicated 500GB data disk
          mounted at `/mnt/disks/data`.
2.  **Connectivity Check**:
    - [x] **Verification**: Orbit establishes a signal lock via the BeyondCorp
          SSH Relay using the `nic0.` hostname.
3.  **Idempotency**:
    - Re-run the same `liftoff` command.
    - [x] **Verification**: Pulumi reports "No changes" and returns success.

---

## 🚀 Phase 3: Mission Control

**Goal**: Verify remote mission orchestration and "Sticky Station" UX.

1.  **Launch Mission**:
    - `orbit mission val-mission chat`
    - [x] **Verification**: Automatically targets the last-provisioned station
          (`val-station`).
    - [x] **Verification**: Creates a remote workspace on the 500GB data disk.
    - [x] **Verification**: Handles new branches by creating them locally if
          missing on remote.
2.  **Pulse Check**:
    - `orbit station pulse`
    - [x] **Verification**: Displays READY status and lists the active
          `val-mission` capsule with stats.

---

## 🌊 Phase 4: Splashdown

**Goal**: Verify clean decommissioning of all resources.

1.  **Cleanup**:
    - `orbit infra splashdown val-station`
    - [x] **Verification**: Prompts for confirmation.
    - [x] **Verification**: VM, Receipt, and all automated Networking resources
          (VPC, NAT, etc.) are destroyed.

---

## 🌐 Scenario 2: External/Existing Network

**Goal**: Verify that Orbit can provision instances on an existing VPC using an
external public IP.

1.  **Schematic Creation**:
    - `node bundle/orbit-cli.js infra schematic gemini-team --projectId gemini-cli-team-quota --backendType external --zone us-central1-a --manageNetworking false`
    - [x] **Verification**: `manageNetworking` is false, and backend is
          external.
2.  **External Liftoff**:
    - `orbit infra liftoff team-station --schematic gemini-team`
    - [x] **Verification**: Orbit skips networking automation and uses the
          `default` VPC.
    - [x] **Verification**: A static public IP is provisioned and assigned.
3.  **External Mission**:
    - `orbit mission team-mission chat`
    - [x] **Verification**: Orbit connects via the public IP and launches the
          mission successfully.

---

## 🛡️ Security & Integrity

1.  **RAM-disk secret mount (ADR 14)**:
    - [x] Verify `/dev/shm/.orbit-env-*` exists on host while mission is active.
    - [x] Verify capsule mounts this at `/.env`.
2.  **Path Parity**:
    - [x] Verify host and capsule both use `/mnt/disks/data` for Git metadata
          consistency.
