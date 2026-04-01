# Orbit Mission: Jettison (orbit jettison)

The **Jettison** command provides a surgical cleanup of individual mission environments. Use it when a mission is complete to reclaim resources and keep your environment clean.

## 🧹 Surgical Cleanup

When you are done with a mission, run:

```bash
orbit jettison 123
```

### 1. Resource Disposal
- **Remote (GCE)**: Immediately terminates the specific Docker capsule and removes the process-isolated container.
- **Local**: Removes the mission-specific Git worktree and kills any associated persistent `tmux` sessions.

### 2. Worktree Cleanup
Each mission has its own isolated Git worktree. Jettison will:
- **Delete the Directory**: Remove the mission-specific folder (e.g., `worktrees/mission-123-chat`).
- **Clear Metadata**: Ensure the primary repository remains in a clean state.

### 3. Telemetry Removal
Jettison also cleans up the transient data associated with the mission, including terminal logs and agent progress trackers.

---

## 🛠️ Command Reference

- `orbit jettison <ID> [action]`: Surgically remove a specific mission workstream (e.g., `orbit jettison 123 fix`).
- `--yes`, `-y`: Bypass the confirmation prompt (useful for automation).

## ✨ Why Jettison?

- **Resource Management**: Keeps your station's disk and memory usage efficient.
- **Environment Freshness**: Ensures that re-launching a mission for the same task starts with a clean slate.
- **Data Privacy**: Removes ephemeral code and terminal history when no longer needed.

---

*Note: In the Gemini App, you can also use the `/orbit:jettison` slash command.*
