# Gemini Workspaces Extension

![CI](https://github.com/mattKorwel/gemini-workspaces-extension/actions/workflows/test.yml/badge.svg)
![Coverage](https://img.shields.io/badge/coverage-65%25-yellow)

High-performance remote development workspaces for Gemini CLI. This extension allows you to delegate heavy tasks (autonomous fixes, long builds, complex reviews) to an isolated, high-performance GCE worker.

## 🚀 Quick Start

1. **Installation**:
   ```bash
   gemini extensions install https://github.com/mattKorwel/gemini-workspaces-extension.git
   ```

2. **Setup**: Initialize your remote environment. This will prompt you to create a **Profile** (e.g., `corp` or `sandbox`).
   ```bash
   /workspace:setup
   ```

3. **Open a PR**: Launch an isolated workspace for a specific PR.
   ```bash
   /workspace:open 23176
   ```

---

## 🏗️ Architecture: Deep Dive

### Multi-Container Isolation
The system utilizes a "Hub and Spoke" container model running on a GCE Container-Optimized OS (COS) host:

- **Supervisor (`development-worker`)**: A persistent container that acts as the "Home Base." It manages global extension linking, shared configuration, and persistent tmux sessions.
- **PR Containers (`gcli-<pr>-<action>`)**: Ephemeral, isolated containers created for every PR workspace. These are isolated at the process level and run your code in a dedicated environment.

### Shared State Strategy
To maintain performance and consistency:
- **Persistent Disk**: A 200GB+ disk is mounted at `/mnt/disks/data`.
- **Unified Config**: The host directory `/mnt/disks/data/gemini-cli-config/.gemini` is mounted to `/home/node/.gemini` in **every** container. This ensures that a linked extension or a UI theme is instantly available across all your workspaces.
- **Reference Clones**: PR containers perform a `git clone --reference` against a read-only master clone on the host disk, making "checkouts" nearly instantaneous.

### Advanced Profile System
Profiles are stored globally in `~/.gemini/workspaces/profiles/*.json`. This allows you to switch between entirely different GCP projects, VPCs, and networking modes (IAP vs Direct) with a single command.

---

## 🛠️ Advanced Usage

### Headless Automation
For CI/CD or automated scripts, use the `--profile` and `--yes` flags:
```bash
npx tsx scripts/setup.ts --profile=corp --yes --reconfigure
```

### Connectivity Backends
- `direct-internal`: Fastest. Uses VPC-internal DNS hostnames. Requires corporate VPN/Network.
- `iap`: Most secure. Tunnels SSH through GCP Identity-Aware Proxy. No public IPs or VPNs needed.
- `external`: Uses the instance's Public IP (if enabled).

### Maintaining Worker Linters
The worker image includes pre-baked linters (`actionlint`, `shellcheck`, `yamllint`) to ensure fast execution. To update these:
1. Update the `ARG` versions in `.gcp/Dockerfile.development` in the `gemini-cli` repository.
2. Trigger a new build via `gcloud builds submit`.
3. The extension's `ensureReady` logic will automatically detect and pull the new image on next setup/open.

---

## 🛡️ Security Mandates
- **Read-Only Master**: The main host repository clone is mounted **Read-Only** into PR containers.
- **Secret Injection**: GitHub tokens are injected via standard input/pipes to the remote disk, never stored in command history or environment variables on the host.

## ✅ Verification & CI
We run automated tests on every commit to ensure the orchestration logic remains stable.
```bash
npm test
```
