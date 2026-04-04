# Orbit Architecture: Tiered Handshake 🛰️

Orbit uses a two-tier "Chunky Handshake" model to minimize SSH overhead and
maximize execution speed.

## 🏗️ The Two-Tier Model

### Tier 1: Hardware & Base Software (`infra liftoff`)

The local SDK uses Pulumi to provision the cloud resources.

1.  **GCE VM & Disk**: High-performance compute and a persistent 500GB data
    disk.
2.  **Supervisor**: A permanent Docker container that maintains the signal lock.
3.  **Hashed Sync**: The extension `bundle/` and project `.gemini` configs are
    synced to the host using MD5 content hashing to avoid redundant transfers.

### Tier 2: Execution & Mission Start (`mission start`)

The local SDK performs a lightweight handshake with the remote **Worker**.

1.  **Capsule Provisioning**: A fresh, isolated container is started for the PR.
2.  **Chunky Handshake**: The SDK sends exactly **one** "init" command and
    **one** "run" command to the worker.
3.  **The Worker (`station.js`)**:
    - **Init Phase**: The worker (running inside the capsule) initializes the
      Git workspace from the host mirror using `--reference`.
    - **Run Phase**: The worker executes the mission playbook (`review`, `fix`,
      etc.).

## 🔄 Self-Healing & Lazy Sync

Orbit automatically detects if your local extension code or project policies
have changed. It performs a content-hash check against the remote host before
every mission start. If they match, zero bytes are transferred. If they differ,
only the changed files are `rsync`'d.

## 💾 Data Persistence

All data lives on the persistent data disk mounted at `/mnt/disks/data`.

- `/mnt/disks/data/main`: The bare repository mirror.
- `/mnt/disks/data/workspaces/`: Individual mission worktrees.
- `/mnt/disks/data/bundle/`: The active Orbit extension code.
- `/mnt/disks/data/project-configs/`: Your project's `.gemini` configuration.
