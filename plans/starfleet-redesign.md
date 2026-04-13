# Master Plan: Starfleet Redesign (Remote-First Orchestration) 🛰️

> **Status:** MASTER PLAN (All Phases)  
> **Daemon Environment:** Runs inside a permanent **Supervisor Container** on
> the host VM (using the Fat Image).

## Objective

Redesign Gemini Orbit to eliminate the performance bottlenecks and complexity of
multi-round-trip SSH/Docker commands and fragile file-syncing. Transition to a
**Station Supervisor (API)** model where the local CLI acts as a thin client,
and the remote station handles its own lifecycle, freshness, and mission
management.

## Key Files & Context

- **`src/station/supervisor.ts`**: (New) The persistent daemon/API server.
- **`src/sdk/OrbitSDK.ts`**: Refactor to use the Supervisor API instead of raw
  SSH.
- **`orbit-capsule.Dockerfile`**: Refactor into a "Fat Image" that inherits from
  `gemini-cli:latest`.
- **`src/core/types.ts`**: Define the `MissionManifest` JSON contract.
- **`/mnt/disks/data/`**: The host "Ground Truth" filesystem standard.

---

## 🏗️ Architecture Overview: The Three Pillars

### 1. The Station Supervisor (The Brain)

A persistent Node.js server running in a **permanent Management Container** on
the host VM.

- **Container Name:** `station-supervisor`.
- **Execution Environment:** It uses the same "Fat Image" as mission capsules
  but starts in `server` mode.
- **Orchestration:** It manages sibling mission capsules by mounting the host's
  `/var/run/docker.sock` (Docker-out-of-Docker).
- **Interface:** A single HTTP/JSON API (protected by SSH tunnel).

### 2. The Fat Image & Freshness Sentinel

An "Orbit-Base" image that layers Orbit's logic and system tools on top of
`gemini-cli:latest`.

- **Sentinel:** A scheduled GitHub Action in the Orbit repo that polls the
  Artifact Registry for `gemini-cli` updates and triggers a rebuild.
- **Self-Update:** A "Force Update" maneuver on the Station that can pull
  `gemini-cli` source and rebuild binaries locally on the VM.

### 3. The Thin Client (Local CLI)

The local `orbit` command becomes an API caller.

- **Workflow:**
  1. Establish one SSH tunnel.
  2. POST a `MissionManifest` JSON.
  3. Stream real-time telemetry via WebSocket/Long-polling.
- **Local Dev Flag (`--dev`):** An opt-in mode that triggers a surgical sync of
  the local `bundle/` for rapid iteration (see "Shadow Mode" below).

---

## 🏗️ Detailed Phase Breakdowns (Sub-Plans)

This redesign is broken down into three phased implementation sprints:

1.  **[Sub-01: The Foundation](./starfleet-sub-01-foundation.md)**:
    Communication contracts, Supervisor API (Containerized), and Docker
    orchestration.
2.  **[Sub-02: The Fat Image & Deployment](./starfleet-sub-02-fat-image.md)**:
    Unified Docker blueprint, CI/CD Sentinel, and host bootstrap scripts.
3.  **[Sub-03: The Zero-Sync Transition](./starfleet-sub-03-zero-sync.md)**: SDK
    refactoring, Real-time telemetry, and Shadow Mode.

---

## 🏗️ Development Flow (Shadow Mode)

To support rapid local development without waiting for "Fat Image" rebuilds,
Orbit implements an opt-in **Shadow Mode**.

1.  **Surgical Sync:** When `orbit` is run with `--dev`, the local SDK performs
    a single `rsync` of the local `bundle/orbit-cli.js` to
    `/mnt/disks/data/dev/shadow-bundle.js` on the host.
2.  **Bind Mount Override:** The Supervisor detects this "shadow" bundle and
    instructs Docker to bind-mount it over the internal container binary:
    ```bash
    docker run -v /mnt/disks/data/dev/shadow-bundle.js:/usr/local/bin/orbit ...
    ```
3.  **Hot-Reloading:** The Station Supervisor can also be "shadowed" by
    restarting its container with the same bind-mount policy.
4.  **Default Safety:** In production (no `--dev` flag), the container uses the
    baked-in logic from the image, ensuring zero-sync overhead and absolute
    environment parity.

---

## 📂 The Ground Truth (Host Filesystem)

Standardized layout on the 500GB persistent data disk (`/mnt/disks/data`).

| Path           | Purpose                                        | Mount Policy (in Capsules)     |
| :------------- | :--------------------------------------------- | :----------------------------- |
| `/mirror/`     | Bare git repo mirrors for fast clones.         | Read-Only                      |
| `/workspaces/` | Mission worktrees/clones.                      | Read/Write (Scoped to Mission) |
| `/shared/`     | Global `.gemini` and `.orbit` configs.         | Read-Only                      |
| `/supervisor/` | Supervisor state, SQLite DB, mission registry. | Supervisor Only                |
| `/logs/`       | Aggregated JSON logs for all missions.         | Supervisor Only                |

---

## ✅ Verification & Testing

- **Contract Tests**: Verify the `MissionManifest` validates correctly.
- **E2E Local (Docker-in-Docker)**: Simulate the Starfleet architecture using
  local Docker containers (Supervisor managing sibling capsules).
- **Remote Integration**: Provision a fresh Station and verify a full PR review
  mission starts with zero file-syncing.
- **Freshness Test**: Manually trigger the Sentinel and verify the Station pulls
  the new image on the next mission launch.
