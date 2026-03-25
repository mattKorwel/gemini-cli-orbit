# Gemini Workspaces Development Guide 🚀

This extension provides high-performance, isolated remote development environments for Gemini CLI.

## 🏗️ Architecture: Multi-Container Isolation
The system utilizes a **Persistent GCE Worker** (running Container-Optimized OS) as the host. Every workspace session is isolated at the **process level** using Docker:

- **HostVM**: Maintains the persistent data disk (`/mnt/disks/data`) and a read-write "Source of Truth" clone of the main repository.
- **Isolated Containers**: Each Pull Request session runs in a dedicated container (`gcli-<pr>-<action>`).
- **Reference Clones**: Job containers perform a `git clone --reference` against the HostVM's main repo. The main repo is mounted **Read-Only** into containers for security.
- **Persistence**: TMUX sessions live inside the job containers, allowing you to disconnect and re-attach without losing state.

## ⚙️ Configuration: Profile System
We support multiple GCP projects and networking environments (Corporate vs. Public) via a **Named Profile** system:

- **Profiles**: Stored in `.gemini/workspaces/profiles/*.json`.
- **Backend Types**:
    - `direct-internal`: VPC-internal magic hostname routing (Fastest).
    - `external`: Public IP routing.
    - `iap`: GCP Identity-Aware Proxy tunneling (Secure fallback).
- **Networking Suffixes**:
    - `userSuffix`: Appended to OS Login username (e.g., `_google_com`).
    - `dnsSuffix`: Appended to the standard `.internal` DNS zone (e.g., `.gcpnode.com`).

## 🛠️ Development Workflow

### Testing
We use **Vitest** for unit testing the orchestration logic and provider abstractions.
```bash
npm test
```
*Note: Always run tests before committing to ensure the multi-backend logic remains stable.*

### Adding Commands
Custom slash commands are registered via TOML files in `commands/workspace/`. These wrap the TypeScript scripts in `scripts/` using `npx tsx`.

### Provisioning Logic
If you modify the remote environment setup, you must update `scripts/setup.ts` and potentially the `maintainer` Docker image used in `GceCosProvider.ts`.

## 🛡️ Security Mandates
1.  **Read-Only Source**: Never mount the main host repository as Read-Write into job containers.
2.  **Secret Injection**: Use standard input pipes or temporary `.env` files for token injection. Avoid `docker exec -e` for sensitive credentials.
3.  **Path Parity**: Maintain absolute path parity between Host and Container (`/mnt/disks/data`) to prevent Git metadata corruption.
