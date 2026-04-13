# Orbit Architecture: The Starfleet Model 🛰️

Orbit has evolved into a distributed, three-tier orchestration system. This
model, internally referred to as **Starfleet**, ensures that your development
environment is persistent, portable, and performant.

## 🪐 The Star Map (Core Identity)

To maintain clarity across different environments (Local Docker, Local Worktree,
and Remote GCE), we use a unified terminology mapped to technical roles:

| Space Term             | Technical Role        | Responsibility                                                                                                                       |
| :--------------------- | :-------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Fleet Commander**    | **Local CLI / SDK**   | The "Brain." It resolves user intent, manages infrastructure via Pulumi, and monitors the fleet via the Pulse API.                   |
| **Station Supervisor** | **Control Plane API** | The "Manager." A lightweight Node.js API running on the host that handles workspace setup, capsule lifecycle, and state aggregation. |
| **Agent Satellite**    | **Isolated Worker**   | The "Muscle." A Docker container (Capsule) where the Git worktree lives and the Gemini agent executes maneuvers.                     |

---

## 🏗️ The Three-Tier Execution Flow

### 1. Liftoff (Infrastructure & Provisioning)

The **Fleet Commander** uses Pulumi to provision or wake the **Station**.

1. **Host Setup**: Provisions a GCE VM (Remote) or ensures Docker is ready
   (Local).
2. **Signal Lock**: Launches the **Station Supervisor** to act as the permanent
   management gateway.

### 2. Ignition (Mission Orchestration)

The **Fleet Commander** sends a mission manifest to the **Station Supervisor**.

1. **Workspace Sync**: The Supervisor prepares a high-fidelity Git worktree
   using a local mirror.
2. **Capsule Ignition**: The Supervisor spawns an **Agent Satellite** (Capsule)
   with the correct mounts, secrets, and environment.

### 3. Maneuver (Execution & Pulse)

The agent begins work inside the satellite.

1. **Situational Awareness**: Every tool call or thought is written to a
   `state.json` via hooks.
2. **Pulse Aggregation**: The **Fleet Commander** polls the **Station
   Supervisor**, which aggregates the pulse from all active satellites into a
   single view.

---

## 💾 Data Persistence

All data lives on the persistent data disk mounted at `/mnt/disks/data`.

- `/mnt/disks/data/main`: The bare repository mirror.
- `/mnt/disks/data/workspaces/`: Individual mission worktrees.
- `/mnt/disks/data/bundle/`: The active Orbit extension code.
