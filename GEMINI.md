# Gemini Orbit Development Guide 🚀

This extension provides high-performance, isolated remote development
environments for Gemini CLI.

## 🏗️ Architecture: Multi-Capsule Isolation

The system utilizes a **Persistent Host Station** (running Capsule-Optimized OS)
as the host. Every Orbit mission is isolated at the **process level** using
Docker:

- **Host Station**: Maintains the persistent data disk (`/mnt/disks/data`) with
  restrictive permissions (UID 1000, 770) and a read-write "Source of Truth"
  clone of the main repository.
- **Isolated Capsules**: Each mission runs in a dedicated capsule
  (`orbit-<identifier>-<action>`).
- **Reference Clones**: Job capsules perform a `git clone --reference` against
  the Host Station's main repo. The main repo is mounted **Read-Only** into
  capsules for security.
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

## ⚙️ Configuration: Schematic System

We support multiple Cloud projects and networking environments (Corporate vs.
Public) via a **Named Schematic** system:

- **Schematics**: Stored in `.gemini/orbit/schematics/*.json`.
- **Backend Types**:
  - `direct-internal`: VPC-internal magic hostname routing (Fastest).
  - `external`: Public IP routing.
- **Networking Suffixes**:
  - `userSuffix`: Appended to OS Login username (e.g., `_google_com`).
  - `dnsSuffix`: Appended to the standard `.internal` DNS zone.

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
  `commands/orbit/`. These route through the unified `orbit-cli.ts` dispatcher.
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

### 3. Behavioral Proof

Empirical verification is **mandatory**. Every review mission must attempt to
physically exercise the new code in the terminal and provide logs in the
behavioral proof phase. This task is automatically skipped if the Phase 0 build
fails.

### CI Monitoring

Use the repo-agnostic utility to monitor branch status locally:

```bash
orbit mission ci <BRANCH_NAME>
```

## 🎮 Command Hierarchy (Noun-Verb)

| Entity      | Action                          | Description                                        |
| :---------- | :------------------------------ | :------------------------------------------------- |
| **Mission** | `orbit mission <id> [action]`   | The Workflow: Start, uplink, attach, or jettison.  |
| **Station** | `orbit station <action> [name]` | The Hardware: List, activate, hibernate, or pulse. |
| **Infra**   | `orbit infra <action> [name]`   | The Foundation: Liftoff, splashdown, or schematic. |
| **Config**  | `orbit config <action>`         | The Local: Shell integration and environment.      |

### Infrastructure Lifecycle

To provision or wake a station (Idempotent):

```bash
orbit infra liftoff <INSTANCE_NAME> --schematic <BLUEPRINT>
```

To manage established hardware:

```bash
orbit stations list
orbit station hibernate <INSTANCE_NAME>
orbit station activate <INSTANCE_NAME>
```

## 📐 Architecture Decisions

Key decisions governing this codebase are documented in `.gemini/adr/`:

- **[ADR 0014](/.gemini/adr/0014-secure-credential-injection.md)**: RAM-disk
  credential injection — secrets are written to `/dev/shm` on the Host Station,
  mounted read-only into capsules, and cleaned up when the mission exits. Never
  written to persistent disk.
- **[ADR 0015](/.gemini/adr/0015-unified-application-architecture.md)**: Unified
  functional core — all scripts export a `runX(args)` function; both the CLI
  (`orbit-cli.ts`) and MCP server (`mcp-server.ts`) import them directly. No
  more spawning Node subprocesses for internal commands.

## 🛡️ Security Mandates

1.  **Read-Only Source**: Never mount the main host repository as Read-Write
    into job capsules.
2.  **Secret Injection**: Use RAM-based temporary file mounts (e.g.,
    `/dev/shm/.orbit-env-*`) for token injection. **NEVER** use
    `docker run/exec -e` for sensitive credentials.
3.  **Path Parity**: Maintain absolute path parity between Host and Capsule
    (`/mnt/disks/data`) to prevent Git metadata corruption.
4.  **Least Privilege**: Always use granular IAM scopes for Station VMs. Avoid
    `cloud-platform` scope.
5.  **Input Sanitization**: Always sanitize user-provided names for schematics,
    stations, and repositories using the `sanitizeName` helper.
