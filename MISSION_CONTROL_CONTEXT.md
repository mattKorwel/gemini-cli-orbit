# Mission Control Context: feat/mission-control 🚀

This branch implements the **Starfleet Architecture** and the **Unified Command
Engine**, transforming Gemini Orbit into a distributed, high-fidelity developer
platform.

## 🪐 The Core Identity

Orbit is no longer a set of disparate CLI scripts. It is now a structured,
three-tier orchestration system:

1.  **Fleet Commander (Hub)**: The local Gemini SDK/CLI. Orchestrates hardware
    and monitors the fleet via `station pulse`.
2.  **Station Supervisor (Manager)**: The remote/host management layer. Handles
    workspace setup, mission spawning, and state aggregation.
3.  **Agent Satellite (Capsule)**: The persistent Gemini session inside a
    mission workspace. Executes engineering work and manifests its state via
    hooks.

## 🚀 Key Architectural Changes

### 1. Unified Command Engine

We have eliminated raw string interpolation for process spawning. All execution
now flows through a structured pipeline:

- **`ProcessManager`**: Centralized, logged process spawning with consistent
  error handling.
- **Specialized Executors**: Typed command builders (`NodeExecutor`,
  `GitExecutor`, `TmuxExecutor`, `GeminiExecutor`, `DockerExecutor`) ensure
  consistent flags and safety.
- **`Command`-First Providers**: The `OrbitProvider` interface and all
  implementations (`GceCos`, `LocalWorktree`) now natively support structured
  `Command` objects.

### 2. Situational Awareness (Post-Turn Hooks)

Missions now automatically manifest their status:

- **Hard-linked Hooks**: Gemini CLI in each capsule is configured with
  `BeforeAgent`, `AfterAgent`, `BeforeTool`, and `Notification` hooks.
- **`state.json`**: Hooks write the current state (🧠 Thinking, ⏳ Waiting for
  Input, 🛑 Blocked on Approval) to a persistent manifest.
- **Aggregated Pulse**: `station pulse` now performs a single call to the
  Station Supervisor, which aggregates all `state.json` files into a unified
  "Starfleet Dashboard."

### 3. Starfleet Naming Parity

Unified the naming convention to `orbit-<identifier>-<action>` across all tiers:

- **Git Worktrees**: Named consistently to prevent local collisions.
- **Docker Containers**: Named identically for easy management.
- **Tmux Sessions**: Matching names ensure the `attach` command always finds the
  right session.

### 4. Resilient Remote Execution

- **PATH Injection**: `GceCosProvider` automatically injects the correct NPM
  global paths into capsule executions.
- **Absolute Binary Resolution**: Used `process.execPath` to ensure `node` is
  always findable in heterogeneous environments.
- **Resilient Branching**: Missions now fall back to creating branches from
  `HEAD` if the remote branch is missing (e.g., old/merged PRs).

## 🛠️ Verification State

- **Unit Tests**: 127 tests passing (including new tests for ProcessManager,
  Executors, and StatusAggregator).
- **Local Verification**: Successfully launched and monitored `chat` missions in
  the `gemini-cli` repo.
- **Remote Verification**: Successfully provisioned a fresh GCE station
  (`starfleet-test-v1`) and verified the entire launch-and-pulse flow.

## 🔮 Future Directions

- Implement the `teleport` command to move mission data between local and remote
  stations.
- Enhance the dashboard with progress bars and more detailed "Handoff Notes."
- Finalize the transition to making the Station Supervisor a permanent part of
  the dev container.
