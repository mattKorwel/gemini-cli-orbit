# Orbit Dependencies 📦

To provide high-performance, isolated remote missions, Orbit relies on several key external tools. This document explains what they are, how they are managed, and how you can control them.

## ☁️ Pulumi CLI

Orbit uses **Pulumi** as its Infrastructure-as-Code (IaC) engine to programmatically provision and manage your Orbital Stations on Google Cloud.

### Automatic Management
By default, Orbit provides a "zero-friction" experience. When you run `orbit liftoff` for a cloud-based schematic:
1. Orbit checks if `pulumi` is available in your system PATH.
2. If missing, Orbit will prompt you for permission to automatically download and install the correct Pulumi binary for your platform.
3. Managed binaries are stored in: `~/.gemini/orbit/bin/`.

### Manual Installation
If you prefer to manage Pulumi yourself, you can install it via standard package managers:
- **macOS**: `brew install pulumi`
- **Linux**: `curl -fsSL https://get.pulumi.com | sh`

Orbit will always prioritize a version found in your system PATH over its own managed version.

---

## 🛠️ Local Dependencies

For local missions and general operations, Orbit expects the following to be present in your environment:

- **Git**: Required for worktree isolation and source synchronization.
- **TMUX**: Recommended for persistent, "attachable" mission sessions. 
  - *Note*: If TMUX is missing, missions will run in your active terminal foreground and will terminate if the window is closed.
- **Docker**: (Remote Only) Required on the **Station VM** (handled automatically by Orbit's COS image).

---

## 🔒 Security & Privacy

- **Managed Binaries**: All tools downloaded by Orbit come from their respective official release channels (e.g., `get.pulumi.com`).
- **State Storage**: Pulumi state is stored locally on your machine in `~/.gemini/orbit/state/`. Orbit **never** uploads your infrastructure state to a managed SaaS backend.
