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

## ✨ Quick Commands

- `orbit mission launch <PR> [action]`: Launch a mission (chat, fix, review,
  etc).
- `orbit mission peek <PR>`: Get a real-time terminal snapshot (text-based) of
  the mission.
- `orbit mission shell <PR>`: Enter a raw side-terminal in the mission capsule.
- `orbit mission ci <PR>`: Monitor GitHub Actions status for the PR.
- `orbit mission jettison <PR>`: Purge remote container and workspace.
- `orbit constellation --pulse`: View state and resource usage of all active
  missions.
