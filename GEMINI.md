# Gemini Orbit Development Guide 🚀

This is the developer's manual for working on the Gemini Orbit extension. For
the runtime context provided to the LLM during missions, see `docs/GEMINI.md`.

## 🏗️ Architecture: The Logical Pillars

Orbit is organized into four logical entities, which are reflected in the CLI
and MCP interfaces:

1. **Mission**: Workflow management (PRs, Issues, Task Execution).
2. **Station**: Hardware management (VM lifecycle, health, pulse).
3. **Infra**: Foundation management (Pulumi provisioning, Schematics).
4. **Config**: Environment management (Shell integration, local setup).

## 📂 Source Structure

The project has been refactored into a symmetrical, peer-based entry point
model:

- **`src/cli/`**: Human entry point (`cli.ts`) and associated unit tests.
- **`src/mcp/`**: Model entry point (`mcp.ts`) providing tools and prompts.
- **`src/sdk/`**: The stateful SDK and Managers (`MissionManager`,
  `FleetManager`, etc.).
- **`src/core/`**: The stateless functional core (Constants, Types, TaskRunner,
  Logger).
- **`src/capsule/`**: Logic that runs _inside_ remote environments
  (`entrypoint.ts`, `worker.ts`).
- **`src/playbooks/`**: Complex multi-phase mission definitions.

## 🛠️ Development Workflow

### Build & Bundle

The project uses `esbuild` to produce a minified ESM bundle.

```bash
npm run build:bundle
```

Bundles are output to `bundle/` and are pointed to by `gemini-extension.json`
and `package.json`.

### Testing

We use **Vitest** for all logic verification. Tests are colocated with their
respective modules where possible.

```bash
npm test
```

## 🔭 Mission Control: Orchestration

Missions follow a strict phased execution via the `TaskRunner`:

- **Phase 0 (Context)**: Parallel fetch of mission metadata and code.
- **Phase 1 (Evaluation)**: CI monitoring and mandatory **Behavioral Proof**.
- **Phase 2 (Synthesis)**: Unified assessment generation.

## 🛡️ Security Mandates

1. **Secret Injection**: Use RAM-disk (`/dev/shm`) mounts for sensitive
   credentials. Never write secrets to persistent disk.
2. **Read-Only Source**: Host repositories are mounted Read-Only into capsules.
3. **Path Parity**: Maintain `/mnt/disks/data` parity to prevent Git metadata
   corruption.

## 📐 Key Decisions

- **[ADR 0015](/.gemini/adr/0015-unified-application-architecture.md)**: Unified
  functional core with peer entry points.
- **[ADR 0016](/.gemini/adr/0016-idempotent-instance-first-provisioning.md)**:
  Instance-centric naming and idempotent liftoff.
- **[ADR 0017](/.gemini/adr/0017-mission-control-situational-awareness.md)**:
  Distributed mission control and situational awareness.
