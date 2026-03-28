# Gemini Orbit Development Guide 🚀

This extension provides high-performance, isolated remote development environments for Gemini CLI.

## 🏗️ Architecture: Multi-Capsule Isolation
The system utilizes a **Persistent Host Station** (running Capsule-Optimized OS) as the host. Every orbit session is isolated at the **process level** using Docker:

- **HostVM**: Maintains the persistent data disk (`/mnt/disks/data`) with restrictive permissions (UID 1000, 770) and a read-write "Source of Truth" clone of the main repository.
- **Isolated Capsules**: Each Pull Request session runs in a dedicated capsule (`gcli-<pr>-<action>`).
- **Reference Clones**: Job capsules perform a `git clone --reference` against the HostVM's main repo. The main repo is mounted **Read-Only** into capsules for security.
- **Persistence**: TMUX sessions live inside the job capsules, allowing you to disconnect and re-attach without losing state.

## 🔗 Shared State Strategy
To ensure a consistent developer experience across all isolated PR sessions, we utilize a **Shared Configuration** model:
- **Mount Path**: `/mnt/disks/data/gemini-cli-config/.gemini` is mounted to `/home/node/.gemini` in **every** capsule.
- **Benefits**: Linking an extension (like `orbit`) in one capsule makes it instantly available to all other PR capsules on that station. It also unifies UI themes and aliases.
- **Concurrency**: Gemini CLI handles concurrent access to this folder via atomic writes and file locking.

## ⚙️ Configuration: Profile System
We support multiple Cloud projects and networking environments (Corporate vs. Public) via a **Named Profile** system:

- **Profiles**: Stored in `.gemini/orbit/profiles/*.json`.
- **Backend Types**:
    - `direct-internal`: VPC-internal magic hostname routing (Fastest).
    - `external`: Public IP routing.
    - `iap`: Secure tunnel access (Secure fallback).
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
Custom slash commands are registered via TOML files in `commands/orbit/`. These wrap the TypeScript scripts in `scripts/` using `npx tsx`.

### Provisioning Logic
If you modify the remote environment setup, you must update `scripts/setup.ts` and potentially the `development` Docker image used in `GceCosProvider.ts`.

## 🛡️ Security Mandates
1.  **Read-Only Source**: Never mount the main host repository as Read-Write into job capsules.
2.  **Secret Injection**: Use RAM-based temporary file mounts (e.g., `/dev/shm/.gcli-env-*`) for token injection. **NEVER** use `docker run/exec -e` for sensitive credentials.
3.  **Path Parity**: Maintain absolute path parity between Host and Capsule (`/mnt/disks/data`) to prevent Git metadata corruption.
4.  **Least Privilege**: Always use granular IAM scopes for GCE instances. Avoid `cloud-platform` scope.
5.  **Input Sanitization**: Always sanitize user-provided names for profiles, stations, and repositories using the `sanitizeName` helper.
