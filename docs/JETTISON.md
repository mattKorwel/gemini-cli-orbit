# Orbit Mission: Jettison (/orbit:jettison)

The **Jettison** command provides a surgical cleanup of individual mission environments. Use it when a mission is complete to reclaim resources and keep your Host Station clean.

## 🧹 Surgical Cleanup
When you are done with a PR mission, run:
```bash
/orbit:jettison 123
```

### 1. Capsule Disposal
Jettison will:
- **Stop the Container**: Immediately terminate the specific mission capsule (e.g., `gcli-123-open`).
- **Remove Docker Resources**: Clean up the process-isolated container and any ephemeral layers.

### 2. Worktree Cleanup
Each mission capsule has its own isolated Git worktree on the Host Station. Jettison will:
- **Delete the Directory**: Remove the mission-specific worktree (e.g., `orbit-123-open`).
- **Clear Metadata**: Ensure your Station's master repository remains in a clean state.

### 3. Telemetry Removal
Jettison also cleans up the "Blackbox" data associated with the mission:
- **Remove History**: Deletes terminal logs and command history specific to that mission PR.
- **Wipe Telemetry**: Clears any background agent progress trackers.

---

## 🛠️ Jettison Options
- `/orbit:jettison <PR> [action]`: Surgically remove a specific mission workstream (e.g., `orbit:jettison 123 fix`).

## 🛰️ Global Splashdown (Experimental)
To completely wipe all missions and reset your Host Station, see the **Splashdown** command documentation (coming soon).

## ✨ Why Jettison?
- **Resource Management**: Keeps your Host Station disk and memory usage efficient.
- **Environment Freshness**: Ensures that launching a new mission for the same PR starts with a clean slate.
- **Data Privacy**: Removes ephemeral PR code and terminal history when no longer needed.
