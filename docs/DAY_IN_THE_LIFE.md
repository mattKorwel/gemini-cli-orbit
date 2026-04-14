# 🛰️ Day in the Life of a Gemini Orbit Engineer

This guide walks you through a typical development cycle using Gemini Orbit.
Orbit provides high-performance, isolated remote environments for your PRs and
missions.

---

## 🌅 1. Morning Liftoff: Starting your Station

When you start your day (or work on a new repository), you need to ensure your
**Persistent Host Station** is ready.

```bash
# Provision or wake up your station
orbit infra liftoff my-station --schematic personal
```

- **What happens**: Orbit checks if your Station exists. If not, it creates it.
  It ensures the Docker daemon is ready and the latest capsule images are
  pulled.
- **Persistent Data**: Your `/mnt/disks/data` disk is preserved across
  stops/starts. Your main repo clone is always there.

---

## 🚀 2. Starting a New Mission (PR)

You've found a bug or a feature to implement. You want a clean, isolated
environment.

```bash
# Start a new mission for an issue
orbit mission <issue-number> implement
```

- **Isolation**: Orbit creates a dedicated **Capsule** (Docker container) and a
  **Git Worktree**.
- **Speed**: It uses a `git clone --reference` against the host's main repo, so
  it takes seconds, not minutes.
- **Context**: The `implement` playbook automatically fetches issue metadata and
  relevant codebase context.

---

## 🛠️ 3. Developing & Debugging

You are now working inside your capsule. You can attach to it at any time:

```bash
# Attach to the active mission session
orbit mission attach <pr-number>
```

- **Persistence**: Attach uses TMUX. You can disconnect, lose your internet
  connection, or switch machines—your terminal state is preserved.
- **Native Experience**: Use your local VS Code or editor. Changes are synced
  (or mounted) automatically.

---

## 🔍 4. Mission Control: Reviewing a PR

Before you merge, you want a high-fidelity review.

```bash
# Run a consolidated review mission
orbit mission <pr-number> review
```

- **The Behavioral Proof**: Orbit won't just look at the code; it will
  physically execute it in the capsule and provide logs.
- **CI Monitoring**: It watches the actual GitHub Actions status in parallel.
- **Synthesis**: You get a `final-assessment.md` with everything you need to
  know.

---

## 🧹 5. Splashdown: Cleaning Up

Once your PR is merged, clean up the specific mission resources.

```bash
# Remove the specific mission capsule and worktree
orbit mission jettison <pr-number>
```

At the end of the day, stop your Host Station to save costs:

```bash
# Stop the Station (preserving the disk)
orbit infra splashdown my-station
```

---

## 🆘 Troubleshooting: The Pulse

If something feels wrong, check the status of your entire orbit:

```bash
# Check station and capsule health
orbit constellation --pulse
```

- **Thinking vs Waiting**: Pulse tells you if an agent is currently busy or
  waiting for your input.
- **Resource Usage**: (Coming Soon) View CPU and Memory pressure on your
  station.

---

## 💡 Pro-Tips

1. **Shared Config**: Any extension you link or alias you create in `.gemini/`
   is instantly available in _all_ capsules.
2. **Station Management**: Use `orbit infra schematic ...` to manage your
   blueprints and `orbit infra liftoff` to build or wake stations.
3. **Bulk Cleanup**: Use `orbit infra splashdown --all` to wipe out all active
   remote capsules at once.
