# Orbit Testing & Validation 🛰️

This guide defines the end-to-end validation flow for Gemini Orbit. It covers
everything from quick local smoke tests to comprehensive infrastructure and
security verification.

## 📋 Prerequisites

Before starting, ensure your project is built and linked:

```bash
npm run build
```

For remote GCE testing, ensure you have Google Application Default Credentials:

```bash
gcloud auth application-default login
```

---

## ⚡ Quick Smoke Tests (Fast Verification)

Use these commands to quickly verify the three primary operational modes.

### 1. Local Worktree (Host Mode)
This mode uses your local machine's `tmux` and `node` environment directly.

- **Launch**: `orbit mission start smoke-local chat --local`
- **Verify Gemini**: Inside tmux, run `gemini "hello"`.
- **Verify Pulse**: `orbit constellation --pulse` should show the mission.
- **Cleanup**: `orbit mission jettison smoke-local`

### 2. Local Docker (Containerized Starfleet)
This runs the Supervisor and Worker capsules in Docker on your local machine.

- **Start Supervisor**: Open a new terminal and run `npm run local:station`.
- **Launch**: `npm run local:chat:docker`
- **Verify Gemini**: Inside the container tmux, run `gemini "hello"`.
- **Cleanup**: `orbit infra splashdown` (Stops containers via API).

### 3. Remote GCE (Cloud Starfleet)
Full production path using Pulumi to provision real infrastructure.

- **Liftoff**: `orbit infra liftoff smoke-remote --schematic personal-gcp`
- **Launch**: `orbit mission start smoke-remote chat --for-station smoke-remote`
- **Verify Gemini**: Inside the remote tmux, run `gemini "ls -R"`.
- **Cleanup**: `orbit infra splashdown smoke-remote`

---

## 🏗️ Comprehensive Validation Protocol

For major releases, follow this structured protocol to ensure system integrity.

### Phase 1: Environment & Setup
- [ ] **Shell Integration**: Run `orbit config install`. Verify `~/.zshrc` contains Orbit aliases.
- [ ] **Schematic Wizard**: Run `orbit infra schematic create test-blueprint`. Verify the interactive wizard saves valid JSON to `~/.gemini/orbit/schematics/`.

### Phase 2: Infrastructure & Networking
- [ ] **Networking Idempotency**: Run `liftoff` twice. Second run should report "No changes" in Pulumi.
- [ ] **Disk Mounting**: Verify the GCE VM has a dedicated data disk mounted at `/mnt/disks/data`.
- [ ] **Signal Lock**: Verify Orbit connects via the internal hostname (BeyondCorp Relay) in `direct-internal` mode.

### Phase 3: Mission Control UX
- [ ] **Sticky Stations**: Launch a mission without `--for-station`. Verify it targets the last-used station automatically.
- [ ] **Branch Management**: Launch a mission on a branch that doesn't exist on remote. Verify Orbit creates it correctly.

---

## 🛡️ Security & Integrity Checks

Verify these critical security mandates:

1.  **RAM-disk Secrets (ADR 14)**:
    - [ ] While a mission is active, verify that sensitive env files exist ONLY in `/dev/shm/.orbit-env-*` on the host and are mounted as `/.env` in the capsule.
2.  **Path Parity**:
    - [ ] Verify both host and capsule use `/mnt/disks/data` for Git metadata to prevent index corruption.
3.  **Read-Only Source**:
    - [ ] Verify that host repositories are mounted as Read-Only into capsules to prevent accidental mutation of the host source.

---

## 🌐 Advanced Scenario: External Network

Verify that Orbit can provision on an existing VPC with a public IP:

1.  **Configure**: Create a schematic with `useDefaultNetwork: true` and `networkAccessType: external`.
2.  **Liftoff**: Verify Orbit skips VPC creation and assigns a static public IP.
3.  **Connectivity**: Verify SSH connectivity via the public IP address.
