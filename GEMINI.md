# Gemini Orbit Development Guide 🚀

This extension provides high-performance, isolated remote development
environments for Gemini CLI.

## 🏗️ Architecture: Multi-Capsule Isolation

The system utilizes a **Persistent Host Station** (running Capsule-Optimized OS)
as the host. Every Orbit mission is isolated at the **process level** using
Docker:

- **HostVM**: Maintains the persistent data disk (`/mnt/disks/data`) with
  restrictive permissions (UID 1000, 770) and a read-write "Source of Truth"
  clone of the main repository.
- **Isolated Capsules**: Each mission runs in a dedicated capsule
  (`gcli-<identifier>-<action>`).
- **Reference Clones**: Job capsules perform a `git clone --reference` against
  the HostVM's main repo. The main repo is mounted **Read-Only** into capsules
  for security.
- **Persistence**: TMUX sessions live inside the job capsules, allowing you to
  disconnect and re-attach without losing state.

## 🔗 Shared State Strategy

To ensure a consistent developer experience across all isolated PR missions, we
utilize a **Shared Configuration** model:

- **Mount Path**: `/mnt/disks/data/gemini-cli-config/.gemini` is mounted to
  `/home/node/.gemini` in **every** capsule.
- **Benefits**: Linking an extension (like `orbit`) in one capsule makes it
  instantly available to all other Orbit capsules on that station. It also
  unifies UI themes and aliases.
- **Concurrency**: Gemini CLI handles concurrent access to this folder via
  atomic writes and file locking.

## ⚙️ Configuration: Profile System

We support multiple Cloud projects and networking environments (Corporate vs.
Public) via a **Named Profile** system:

- **Profiles**: Stored in `.gemini/orbit/profiles/*.json`.
- **Backend Types**:
  - `direct-internal`: VPC-internal magic hostname routing (Fastest).
  - `external`: Public IP routing.
  - `iap`: Secure tunnel access (Secure fallback).
- **Networking Suffixes**:
  - `userSuffix`: Appended to OS Login username (e.g., `_google_com`).
  - `dnsSuffix`: Appended to the standard `.internal` DNS zone (e.g.,
    `.gcpnode.com`).

## 🛠️ Development Workflow

### Environment Setup

Before running tests or linting, ensure all dependencies are installed:

```bash
npm install
```

### Testing & Quality

We use **Vitest** for unit testing and **ESLint** for code quality.

- **Tests**: `npm test` (Always run before committing).
- **Linting**: `npm run lint` (Required to pass CI).

### Adding Commands & Playbooks

- **Commands**: Custom slash commands are registered via TOML files in
  `commands/orbit/`. These wrap the bundled JavaScript entry points in
  `bundle/`.
- **Playbooks**: Complex multi-step missions (like `review` or `fix`) should be
  implemented in `scripts/playbooks/` using the parallel `TaskRunner`.

## 🔭 Mission Control: Consolidated Review Architecture

The PR review process is a high-fidelity, parallelized TypeScript mission
defined in **ADR 9**.

### 1. Phased Parallel Orchestration

The mission follows a strict phased execution:

- **Phase 0 (Context)**: Parallel fetch of mission metadata, diff, recursive
  issue hierarchy (up to 3 levels), and a single-source build.
- **Phase 1 (Evaluation)**: Parallel background tasks for CI monitoring, static
  rules enforcement, feedback analysis, and mandatory **Behavioral Proof**.
- **Phase 2 (Synthesis)**: Unified merge of all logs into `final-assessment.md`.

### 2. Repo-Specific Development Guidelines

The mission automatically respects local standards by collecting guidelines
from:

1. `GEMINI.md` (Top Priority)
2. `.gemini/review-rules.md`
3. `CONTRIBUTING.md`

### 3. "Mustard Test" (Behavioral Proof)

Empirical verification is **mandatory**. Every review mission must attempt to
physically exercise the new code in the terminal and provide logs in the
behavioral proof phase. This task is automatically skipped if the Phase 0 build
fails.

### 4. CI Monitoring

Use the repo-agnostic utility to monitor branch status locally:

```bash
node bundle/ci.js <BRANCH_NAME>
```

## 🛡️ Security Mandates

1.  **Read-Only Source**: Never mount the main host repository as Read-Write
    into job capsules.
2.  **Secret Injection**: Use RAM-based temporary file mounts (e.g.,
    `/dev/shm/.gcli-env-*`) for token injection. **NEVER** use
    `docker run/exec -e` for sensitive credentials.
3.  **Path Parity**: Maintain absolute path parity between Host and Capsule
    (`/mnt/disks/data`) to prevent Git metadata corruption.
4.  **Least Privilege**: Always use granular IAM scopes for GCE instances. Avoid
    `cloud-platform` scope.
5.  **Input Sanitization**: Always sanitize user-provided names for profiles,
    stations, and repositories using the `sanitizeName` helper.
