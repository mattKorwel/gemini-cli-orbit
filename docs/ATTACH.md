# Orbit Mission: Attach (`orbit mission attach`)

The **Attach** command allows you to jump directly into an active mission
environment. This is the primary way to take manual control of an ongoing
mission.

## 🔗 Persistence & Re-attachment

Orbit sessions are persistent (wrapped in `tmux`). You can safely disconnect and
re-attach at any time without losing your state or interrupting the agent.

Attach to a specific mission by providing the mission ID:

```bash
orbit mission attach 123
```

### 1. Unified Interaction

When you attach, you enter the exact environment where the Gemini agent is
working.

- **Shared Terminal**: You and the agent share the same terminal state.
- **Manual Overrides**: You can manually fix a build, run a test, or edit a
  file, and the agent will detect your changes.
- **Context Preservation**: Your shell history, environment variables, and
  active processes are preserved.

### 2. Advanced Terminal Handling (macOS + iTerm2)

If you are running the Gemini CLI on macOS with iTerm2, `orbit mission attach`
will automatically:

- Open a new iTerm2 tab.
- Establish the secure tunnel (if remote).
- Attach to the correct `tmux` session within the mission.

---

## 🛠️ Command Reference

- `orbit mission attach <ID> [action]`: Attach to a specific PR workstream
  (e.g., `orbit mission attach 123 review`).
- `--local`: (Global Flag) Force local worktree mode.

## ✨ Key Benefits

- **Manual Debugging**: If an autonomous mission hits a roadblock, attach and
  clear it manually.
- **Real-time Monitoring**: Watch the agent work in real-time as it executes
  complex refactors.
- **Hardware Freedom**: Disconnect from your terrestrial machine, and
  `orbit mission attach` again later from any device to resume right where you
  were.

---

_Note: In the Gemini App, you can also use the `/orbit:attach` slash command._
