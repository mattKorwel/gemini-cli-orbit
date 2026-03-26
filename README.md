# Gemini Workspaces Extension 🚀

![CI](https://github.com/mattKorwel/gemini-workspaces-extension/actions/workflows/test.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-36%20passed-green)

High-performance remote development workspaces for Gemini CLI. Delegate heavy tasks—autonomous fixes, long builds, and complex PR reviews—to isolated, high-performance GCE workers.

## 📦 Installation

Install the extension directly from GitHub. Use the `--ref` flag to point to a specific branch (like `multirepo`) or tag.

```bash
gemini extensions install https://github.com/mattKorwel/gemini-workspaces-extension --ref multirepo --auto-update
```

> **Note**: Restart your Gemini CLI session after installation to activate the new commands.

## 🚀 Quick Start

1.  **Setup**: Initialize your environment for the current repository. This will guide you through creating a **Profile** (e.g., `corp` or `sandbox`) and provisioning your worker.
    ```bash
    /workspace:setup
    ```

2.  **Status**: Check the health of your worker and see all active PR containers.
    ```bash
    /workspace:status
    ```

3.  **Open a PR**: Launch an isolated workspace for a specific PR.
    ```bash
    /workspace:open 23176
    ```

4.  **Cleanup**: Surgically remove a specific workspace when finished.
    ```bash
    /workspace:clean 23176 open
    ```

---

## ✨ New Features (v1.3)

### 📂 Multi-Repository Support
The platform now supports multiple repositories on a single worker. 
- **Isolated Worktrees**: Each repository has its own root on the remote disk (`/mnt/disks/data/worktrees/<repo-name>`).
- **Granular Settings**: Settings are stored in a `repos` map in `settings.json`, allowing unique configurations (different images, regions, or backends) per project.
- **Automated Migration**: Legacy single-repo configurations are automatically migrated on first run.

### 🏗️ WorkerProvider Abstraction
Infrastructure logic is now decoupled from the core CLI via a modular `WorkerProvider` interface.
- **GCE COS Provider**: Optimized for Google Cloud's Container-Optimized OS, utilizing Cloud-Init for a zero-touch "Invisible VM" experience.
- **Pluggable Backends**: Ready for future support of Local Docker, Cloud Workstations, or other compute providers.

### 🛰️ Enhanced Mission Control
The `/workspace:status` command provides a real-time "Supervisor" view:
- **Agent Awareness**: Detects if remote agents are `🧠 [THINKING]` or `✋ [WAITING]` for input.
- **Resource Tracking**: Lists all active containers grouped by repository.
- **Automatic Wakeup**: The system automatically detects if your worker is stopped and offers to start it.

---

## 🏗️ Architecture

### Multi-Container Isolation
The system utilizes a "Hub and Spoke" container model:
- **Supervisor (`development-worker`)**: A persistent container that acts as the "Home Base" for shared config and global extensions.
- **PR Containers (`gcli-<pr>-<action>`)**: Ephemeral, isolated containers created for every PR workspace. These are isolated at the process level for security and stability.

### Shared State Strategy
- **Persistent Disk**: Standardized on a 200GB+ PD-Balanced disk at `/mnt/disks/data`.
- **Unified Config**: `/home/node/.gemini` is mounted into **every** container, ensuring extensions and themes are synchronized across all workspaces.
- **Reference Clones**: Uses `git clone --reference` against a read-only master clone to make new workspace checkouts nearly instantaneous.

---

## 🛠️ Connectivity Backends

- **`direct-internal`**: Fastest. Uses VPC-internal DNS hostnames. Requires corporate VPN/Network.
- **`iap`**: Most secure. Tunnels SSH through GCP Identity-Aware Proxy. No public IPs or VPNs needed.
- **`external`**: Uses the instance's Public IP (if enabled).

---

## 🛡️ Security & Engineering Standards

- **Tier 3 Workspace Policies**: Policies are located in `.gemini/policies/` to satisfy Gemini CLI's security requirements for `ALLOW` rules.
- **Read-Only Master**: The primary repository clone is always mounted **Read-Only** into job containers.
- **Secret Injection**: Tokens are injected via standard input/pipes, never stored in command history.
- **Testing**: Comprehensive Vitest suite with 36+ unit tests covering all providers and configuration logic.

```bash
npm test
```
