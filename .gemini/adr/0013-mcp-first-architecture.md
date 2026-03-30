# ADR 0013: Transition to MCP-First Architecture

## Status

Accepted

## Context

The Orbit extension previously relied on brittle TOML-based slash command
definitions. These definitions used `!{ node ... }` blocks to execute scripts on
disk. This approach suffered from several critical issues:

1.  **Path Resolution**: The CLI had to resolve the absolute path to the
    extension's scripts on every command execution, leading to complex and
    platform-specific shell hacks (e.g.,
    `$(ls -d ~/.gemini/extensions/orbit 2>/dev/null || ls -d . 2>/dev/null)`).
2.  **Fragmented Logic**: Functionality was spread across multiple `.toml` files
    and separate binary entry points.
3.  **LLM Isolation**: The LLM could only "see" commands if it was specifically
    instructed to use slash commands, lacking type-safe Tool access for
    autonomous decision-making.

## Decision

Transition the entire Orbit extension to a Model Context Protocol (MCP) server
architecture.

1.  **Centralized Entry Point**: Consolidate all mission logic into a single,
    long-running Node.js process (`scripts/mcp-server.ts`).
2.  **Prompt-Powered Slash Commands**: Replace `.toml` command files with MCP
    `Prompts`. The Gemini CLI automatically maps these prompts to slash commands
    (e.g., `/orbit:mission`).
3.  **Tool-Driven Autonomy**: Expose all Orbit functionality as type-safe MCP
    `Tools` (e.g., `provision_mission`, `get_orbit_pulse`).
4.  **Surgical Path Resolution**: Use a single robust shell command in
    `gemini-extension.json` to start the MCP server. Internal logic within the
    server process handles all subsequent file imports using standard Node.js
    mechanisms.

## Consequences

### Positive

- **Elimination of Path Hacks**: The "where am I on disk" problem is solved once
  at server startup. Internal paths are resolved by the Node.js runtime.
- **Autonomous Capability**: The LLM can now manage the entire mission lifecycle
  (liftoff, provisioning, status, jettison) without user intervention via tool
  calling.
- **Rich Metadata**: MCP Tools and Prompts provide built-in schema validation
  and documentation, leading to better help messages and autocompletion.
- **Persistence**: The MCP server can maintain internal state or connections
  across multiple user turns, improving performance.

### Negative

- **Memory Overhead**: A persistent Node.js process remains active while the CLI
  is running.
- **Dependency Requirement**: Adds a dependency on `@modelcontextprotocol/sdk`.

### Neutral

- **Refactoring Cost**: Existing CLI scripts had to be refactored into
  side-effect-free library functions.
