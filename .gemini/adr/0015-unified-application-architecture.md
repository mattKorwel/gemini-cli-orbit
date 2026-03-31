# ADR 0015: Unified Application Architecture

## Status

Accepted

## Context

Gemini Orbit previously operated as a collection of independent TypeScript
scripts, coordinated by a Orbit CLI that spawned new Node.js processes for every
command. This "Multi-Process" model led to complex argument passing, fragmented
state management, and platform-specific bugs (e.g., shell expansion differences
between macOS and Linux).

The Model Context Protocol (MCP) server demonstrated a more efficient pattern:
importing core logic as functions and executing them within a single persistent
process.

## Decision

Transition Gemini Orbit into a **Unified Functional Core** architecture.

### 1. Function-First Core

- All primary logic scripts in `scripts/*.ts` must export a consistent
  `runX(args)` function.
- Auto-execution code (e.g., `run().catch(...)`) is removed from core modules.

### 2. Direct-Import Dispatchers

- Both the **CLI Dispatcher (`orbit-cli.ts`)** and the **MCP Server
  (`mcp-server.ts`)** now import core functions directly.
- The use of `spawnSync('node', ...)` for internal coordination is abolished.

### 3. Centralized Flag Consumption

- `orbit-cli.ts` acts as the primary "Front Door" for CLI users. It consumes
  global flags (`-l`, `--repo`, `--schematic`) and manages the environment
  **once** before passing a clean array of positional arguments to the core
  functions.

### 4. Deprecation of Wrapper Binaries

- The `scripts/bin/` directory is removed. Redundant wrappers that merely called
  `process.argv` are replaced by the unified CLI's routing logic.

## Rationale

- **Performance**: Eliminates the overhead of spawning new Node.js instances for
  subcommands.
- **Reliability**: Solves argument parsing bugs by handling flags once at the
  entry point and passing structured data (clean arrays) to the core.
- **Consistency**: Ensures that the CLI and the LLM (via MCP) are calling the
  exact same code, reducing "Logic Drift."
- **Simplicity**: Consolidates the build and bundle process around a smaller set
  of high-level entry points.

## Consequences

- **Positive**: Significantly faster execution and more robust argument
  handling.
- **Positive**: Simpler debugging, as the entire command execution happens in a
  single process stack.
- **Neutral**: Requires careful management of `process.exit` within core
  functions to avoid prematurely killing the MCP server (handled by ensuring
  functions return numeric exit codes instead of calling `process.exit` directly
  where possible).
