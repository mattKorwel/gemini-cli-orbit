# Gemini Orbit: End-to-End Validation Protocol 🛰️

This document defines the gold-standard validation flow for Gemini Orbit. It
ensures that environment setup, full-stack networking automation, and remote
mission orchestration are fully functional.

---

## 📋 Phase 1: Environment Readiness

**Goal**: Verify that a new user can initialize their environment and define a
corporate-ready blueprint.

1.  **Shell Integration**:
    - `node ~/.gemini/extensions/orbit/bundle/orbit-cli.js config install`
    - [x] **Verification**: `~/.zshrc` (or equivalent) contains Orbit aliases and path exports.
2.  **Schematic Creation**:
    - Create a schematic with `orbit infra schematic create corp-val`.
    - Fill the wizard with BeyondCorp-compatible settings and automated
      networking values.
    - [x] **Verification**: `~/.gemini/orbit/schematics/corp-val.json` contains
          the expected values and types.

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
    - `orbit constellation --pulse`
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
    - `orbit infra schematic create gemini-team`
    - Configure the wizard for `external` networking and
      `manageNetworking: false`.
    - [x] **Verification**: `manageNetworking` is false, and networking is
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
