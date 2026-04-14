# Orbit Mission: Launch (orbit mission)

The **Mission** command is the primary way to launch your developer presence
into an isolated orbital environment. It creates a dedicated **Mission Capsule**
for a specific Pull Request or task.

## 🚀 Mission Modes

Launch a mission by providing a PR number or branch:

```bash
orbit mission launch 123 chat
```

### 1. Manual Interaction (`chat`)

This is the default mode for hands-on work inside the capsule alongside Gemini.

- **Smart Resumption**: Running `mission chat` again will automatically attach
  you to your existing session.
- **Persistence**: Sessions are wrapped in `tmux` so they stay alive even if you
  disconnect.

### 🧪 Named Missions (Multi-tasking)

If you need multiple independent environments for the same PR (e.g., one for
debugging, one for a feature), use the `:suffix` syntax:

```bash
orbit 123:debug chat   # Session A
orbit 123:review chat  # Session B (completely isolated)
```

Orbit shares the PR context (branch, code) but provisions **separate Docker
containers** and **separate workspaces** for each named instance.

### 2. Side-Terminals (`shell`)

If you want a raw shell _next to_ your chat window (e.g. to run manual tests),
use:

```bash
orbit mission shell 123
```

This drops you into a raw bash session inside the _same_ container as your chat.
It is an ephemeral side-terminal (EVA style) for manual intervention without
interrupting an active agent session.

---

## 🛰️ Distributed Orchestration

For complex workflows involving multiple missions, Orbit uses the **Orbit Commander** sub-agent to coordinate the fleet.

### The Commander Role
When a task involves multiple PRs or complex monitoring, the AI delegates to the `orbit_commander`. This sub-agent:
- **Parallelizes Launches**: Ignites multiple capsules simultaneously.
- **Synthesizes Progress**: Periodically polls the fleet and provides high-level updates.
- **Offloads Context**: Handles the verbose technical logs and pulse data, keeping your main chat clean.

### Handover Protocol
Once a coordinated task is finished, the Commander provides a **Fleet Synthesis Report**—a unified summary of all missions, their outcomes, and any required manual follow-ups.

---

## ✨ Quick Commands

- `orbit mission launch <PR> [action]`: Launch a mission (chat, fix, review,
  etc).
- `orbit mission peek <PR>`: Get a real-time terminal snapshot (text-based) of
  the mission.
- `orbit mission shell <PR>`: Enter a raw side-terminal in the mission capsule.
- `orbit mission logs <PR>`: View telemetry and progress for the mission.
- `orbit mission jettison <PR>`: Purge remote container and workspace.
- `orbit pulse`: View state and resource usage of all active missions (alias for
  `constellation --pulse`).
