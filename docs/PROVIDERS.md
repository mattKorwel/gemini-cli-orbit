# Orbit Mission Providers

Orbit is designed to be environment-agnostic. You can switch between local and
remote providers by simply changing the `providerType` in your schematic.

---

## 🛰️ GCE Station (`gce`) - Remote

The standard remote provider. It launches a persistent virtual machine in Google
Cloud to act as your high-performance orbital hub.

### Capabilities:

- **Persistence**: Missions continue running even if your laptop is closed.
- **Scale**: Offload heavy builds and tests to server-grade CPUs.
- **Isolation**: Every PR mission runs in a dedicated Docker capsule.

### Configuration (`~/.gemini/orbit/schematics/remote.json`):

```json
{
  "providerType": "gce",
  "projectId": "my-gcp-project",
  "zone": "us-west1-a",
  "instanceName": "gcli-station-matt",
  "backendType": "direct-internal"
}
```

---

## 🌿 Local Worktree (`local-worktree`) - Local

The fastest local provider. It uses native `git worktree` to manage multiple PR
missions on your local filesystem without the overhead of containers.

### Capabilities:

- **Speed**: Instant setup with zero virtualization overhead.
- **Familiarity**: Matches the popular `go` alias workflow.
- **Persistence**: Uses `tmux` to allow you to close your terminal without
  losing agent state.

### Configuration (`~/.gemini/orbit/schematics/local.json`):

```json
{
  "providerType": "local-worktree",
  "worktreesDir": "/Users/matt/dev/orbit-worktrees"
}
```

---

## 📟 Persistence Layer: Tmux

By default, all mission providers (both local and remote) wrap the Gemini agent
in a `tmux` session.

- **Resilience**: You can disconnect and re-attach (`orbit:attach`) seamlessly.
- **Visibility**: Use `orbit:blackbox` or `tmux attach -t mission-ID` to watch
  the agent work.
- **Fallback**: If `tmux` is not detected in the environment, Orbit
  automatically falls back to **Raw Execution** (foreground).

To explicitly disable `tmux` for a schematic, set:

```json
{
  "useTmux": false
}
```
