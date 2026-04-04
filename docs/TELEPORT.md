# Mission Teleportation: State-First Persistence 🛰️🌀

In Gemini Orbit, **the mission is the data, not the machine.** Teleportation is
the ability to move an active mission—including its code, history, and current
thought state—between different stations (e.g., from your local laptop to a
high-performance GCE station).

## 🚀 The Core Philosophy

Unlike traditional remote development which relies on a single persistent
server, Orbit focuses on **State Manifestation**. Because every mission records
its progress in Git and a structured `state.json`, you can "Escape the Gravity"
of your current hardware at any time.

## 🛠️ The Teleportation Protocol

To move a mission from **Station A** to **Station B**, follow these steps:

### 1. Snapshot the Local State

The satellite must manifest its current progress.

- **Code**: Commit or push current changes to a temporary sync branch (e.g.,
  `orbit-sync/pr-123`).
- **Chat History**: Export the current agent session:
  ```bash
  /chat share pr-123-session.json
  ```
- **Context**: Move the `pr-123-session.json` into the `.gemini/orbit/` folder
  within the workspace.

### 2. Re-Initialize Remotely

From the **Fleet Commander** (your local terminal), launch the mission on the
new target:

```bash
orbit mission start 123 chat --for-station remote-alpha
```

### 3. Remote Resumption

The remote **Station Supervisor** will:

1. Clone the repository.
2. Checkout the `orbit-sync/pr-123` branch.
3. The remote **Agent Satellite** will detect the `state.json` and
   `pr-123-session.json`.
4. It will automatically load the chat history and resume exactly where it left
   off on your laptop.

## 🔮 Future: The `teleport` Command

We are working toward a unified command to automate this "Handover":

```bash
# Conceptual:
orbit mission teleport 123 --to remote-alpha
```

This will automatically handle the branch syncing, session exporting
(`/chat share`), and remote triggering in a single atomic action.

## 💡 Why Teleport?

1. **Hardware Scaling**: Start a refactor on your laptop, then teleport it to a
   64-core GCE instance for a massive test suite run.
2. **Isolation**: Move a "messy" task that requires complex dependencies off
   your local machine.
3. **Continuity**: Close your laptop at the office and resume the same mission
   on a remote station from home without losing a single line of thought.
