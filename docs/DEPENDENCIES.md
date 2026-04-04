# Orbit Dependencies 📦

To provide high-performance, isolated remote missions, Orbit relies on several
key external tools. This document explains what they are, how they are managed,
and how you can control them.

## ☁️ Pulumi CLI

Orbit uses **Pulumi** as its Infrastructure-as-Code (IaC) engine to
programmatically provision and manage your Orbital Stations on Google Cloud.

### Recommended: Manual Installation

For the best experience, we recommend installing the Pulumi CLI via your
system's package manager:

- **macOS (Homebrew)**:
  ```bash
  brew install pulumi
  ```
- **Linux (Debian/Ubuntu)**:
  ```bash
  curl -fsSL https://get.pulumi.com | sh
  # Or use APT if you've added the Pulumi repo
  ```
- **Linux (General)**:
  ```bash
  curl -fsSL https://get.pulumi.com | sh
  ```

Orbit will always prioritize a version found in your system PATH over any
locally managed version.

### Option 2: Local Management by Orbit

If you prefer not to install Pulumi system-wide, Orbit can manage a local
version for you.

When you run `orbit liftoff` for a cloud-based schematic and Pulumi is not found
in your PATH:

1. Orbit will explicitly prompt you for permission to download the official
   Pulumi binary.
2. If confirmed, Orbit downloads the correct binary for your OS/Architecture.
3. The binary is stored in isolation at: `~/.gemini/orbit/bin/`.
4. This version is only used by Orbit and does not interfere with other tools on
   your system.

---

## 🛠️ Local Dependencies

For local missions and general operations, Orbit expects the following to be
present in your environment:

- **Git**: Required for worktree isolation and source synchronization.
- **TMUX**: Recommended for persistent, "attachable" mission sessions.
  - _Note_: If TMUX is missing, missions will run in your active terminal
    foreground and will terminate if the window is closed.
- **Docker**: (Remote Only) Required on the **Station VM** (handled
  automatically by Orbit's COS image).

---

## 🔒 Security & Privacy

- **Managed Binaries**: All tools downloaded by Orbit come from their respective
  official release channels (e.g., `get.pulumi.com`).
- **State Storage**: Pulumi state is stored locally on your machine in
  `~/.gemini/orbit/state/`. Orbit **never** uploads your infrastructure state to
  a managed SaaS backend.
