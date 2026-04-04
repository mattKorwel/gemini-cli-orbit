# ADR 0017: Mission Control & Situational Awareness

## Status

Accepted

## Context

Gemini Orbit enables multiple persistent, autonomous developer missions (Agent
Satellites) to run on remote hardware or local worktrees. As the number of
concurrent missions grows, the user (Fleet Commander) loses "situational
awareness." Currently, the only way to know if a mission is complete or blocked
is to manually `attach` to its terminal session. This creates a bottleneck and
prevents effective orchestration of multiple satellites.

The "Starfleet Commander" vision requires a central dashboard that provides a
high-fidelity summary of all active missions without the noise of multiplexed
chat streams.

## Decision

Implement a distributed **Mission Control** architecture based on state
manifestation and aggregation.

### 1. Hierarchical Roles

- **Fleet Commander (Hub)**: The local Gemini CLI/MCP session. Orchestrates
  provisioning and monitors the fleet.
- **Station Manager (Supervisor)**: The `worker.ts` process running on the
  station host. Acts as the aggregator for all missions on that hardware.
- **Agent Satellite (Capsule)**: The persistent Gemini CLI session inside a
  mission capsule. Executes tasks and manifests its state.

### 2. Hook-Driven State Manifestation

Agent Satellites will be "hard-linked" into a state manifestation loop using
Gemini CLI Hooks:

- **`BeforeAgent`**: Updates state to `THINKING`.
- **`BeforeTool`**: If approval is required (manual policy), updates state to
  `WAITING_FOR_APPROVAL` and records the blocked tool name.
- **`AfterAgent`**: Updates state to `IDLE` or `WAITING_FOR_INPUT` (capturing
  the last question asked).
- **Manual Milestones**: Playbooks (`review`, `fix`) explicitly update state to
  `COMPLETED` upon finishing.

State is written to a standardized path: `.gemini/orbit/state.json`.

### 3. Station-Level Aggregation

The Station Manager (Worker) provides a single `status` command that:

- Scans all mission workspaces on the persistent disk.
- Aggregates the `state.json` files into a unified JSON report.
- Returns this report to the Fleet Commander in a single trip.

### 4. Situational Awareness UI

The `orbit station pulse` command is enhanced to display the aggregated station
report, including:

- Status icons (🧠 Thinking, ⏳ Waiting, 🛑 Blocked, ✅ Completed).
- Contextual details (Last thought, blocker description, or summary snippet).

## Rationale

- **Efficiency**: One single SSH call to the Station Manager retrieves the state
  of N missions.
- **Robustness**: CLI Hooks ensure state is captured automatically without
  relying on model-generated instructions.
- **Persistence**: `state.json` outlives the agent process, allowing the
  dashboard to work even if the agent crashes or is restarting.
- **Scalability**: Avoids UI overload by presenting metadata instead of full
  chat transcripts.

## Consequences

- **Positive**: High-fidelity dashboard for managing multiple missions.
- **Positive**: Clear visibility into blockers (approvals/questions) without
  manual intervention.
- **Neutral**: Requires the Station Manager to have read access to all mission
  workspaces (handled via Linux group permissions on `/mnt/disks/data`).
- **Neutral**: Adds a lightweight JSON write operation to every agent turn.
