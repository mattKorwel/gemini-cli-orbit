# Orbit Roadmap: Escaping Gravity 🚀

This document outlines the strategic evolution of Gemini Orbit. Our goal is to
transform it from a CLI-based orchestration tool into a robust, high-performance
distributed engineering platform.

## 🛰️ Phase 5: High-Performance Infrastructure

### 1. Hook Restoration & Situational Awareness

- **Problem**: Current hooks (`BeforeAgent`, `AfterAgent`, etc.) are not
  properly configured or wired, leaving mission states at `IDLE` even when the
  agent is active.
- **Solution**:
  - Fix `GeminiExecutor` to correctly pass `--hook-*` flags to the Gemini CLI.
  - Wire the `hooks.js` script in the mission entrypoint.
  - Ensure `state.json` provides accurate status: `🧠 [THINKING]`,
    `⏳ [WAITING]`, `🛑 [BLOCKED]`.

### 2. Custom Supervisor Image

- **Problem**: We currently sync the extension `bundle/` and project configs via
  multiple SSH/rsync calls, causing churn and latency.
- **Solution**: Move to a "Supervisor First" model. Build a custom Docker image
  containing the Orbit SDK, supervisor logic, and common dependencies.
- **Outcome**: `infra liftoff` becomes a single `docker pull` + `docker run`,
  dramatically reducing cold-start time.

### 3. New Infrastructure Providers

- **Raw SSH**: Enable Orbit to target any SSH-reachable machine (e.g., on-prem
  servers, physical workstations) without Pulumi overhead.
- **Cloud Workstations**: Native integration with Google Cloud Workstations for
  IDE-integrated, managed dev environments.

### 4. Auto-Reaper & Resource Governance

- **Goal**: Implement an automated resource cleanup strategy to prevent station
  starvation and manage cloud costs.
- **Features**: Configurable idle thresholds, automated capsule pruning (Reap),
  and per-capsule CPU/Memory limits.

## 📡 Phase 6: Mission Control API & Dashboard

### 1. Orbit Persistence API

- **Problem**: One-off SSH calls to a CLI are slow and make it hard to maintain
  long-running state or streaming telemetry.
- **Solution**: Implement a persistent API service (running in the Supervisor
  container) that the local SDK communicates with.
- **Outcome**: Faster status checks, real-time log streaming, and a foundation
  for multi-client access.

### 2. Web Constellation Dashboard

- **Goal**: A high-fidelity web interface for monitoring the entire fleet.
- **Features**: Real-time terminal snapshots (Peek), progress bars, detailed
  "Handoff Notes," resource utilization graphs, and one-click "Attach."

## 🛠️ Phase 7: Engineering Excellence

### 1. PR Creation Utility

- **Goal**: Automate the final step of the "Implement" and "Fix" missions by
  providing a high-fidelity PR creation utility that includes mission logs and
  assessments in the PR body.

### 2. Centralized Observability

- **Standard**: All logging must respect the `--verbose` flag.
- **Output**: Public script output should be thin and high-signal, moving
  detailed infrastructure logs to the background or the `--verbose` stream.

### 3. Radical Testing Refactor

- **Strategy**: Move away from heavy mocks in integration tests.
- **Mechanism**: Use a real temporary filesystem for all tests. Hijack the `bin`
  directory to provide "Process Mocks" (e.g., mock `git`, `docker`, `gcloud`)
  that return deterministic output without running real side effects.
- **Goal**: 100% reliable, fast integration tests that exercise the real logic
  paths.

## 🔮 Long-Term Horizon

- **Teleportation**: Seamlessly move active missions between local and remote
  stations.
- **Autonomous Swarms**: Parallelize complex tasks across multiple capsules
  simultaneously.
- **Self-Healing Infra**: Automatically detect and repair station health issues.
