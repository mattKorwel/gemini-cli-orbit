# Commanding Orbit

Orbit can be driven in three different ways:

- direct CLI commands
- natural language inside Gemini CLI
- MCP tools from an MCP-capable client

Use the mode that matches how much control you want.

## 1. Direct CLI

The CLI is the source of truth for Orbit behavior.

Common commands:

```bash
orbit mission launch 123 review
orbit mission attach 123 review
orbit mission uplink 123 review
orbit constellation --pulse
orbit infra schematic list
orbit infra liftoff my-station --schematic personal
```

Use direct CLI commands when:

- you want explicit, scriptable behavior
- you are debugging setup or infrastructure
- you want the exact current command surface without interpretation

## 2. Natural Language In Gemini CLI

Orbit is designed to work well from a Gemini CLI session where the user speaks
in intent rather than command syntax.

Examples:

- "Use the orbit mcp server to install orbit shell integration."
- "Launch a review mission for PR 123."
- "Attach to mission 123."
- "Show me the fleet with pulse details."
- "Provision my personal GCP station."

The cleanest pattern is:

- use natural language when you want intent-driven control
- drop to direct CLI when you need exact flags or troubleshooting detail

Repo shorthand is also supported from the CLI:

```bash
orbit my-repo:mission 123 review
orbit my-repo:constellation --pulse
```

That tells Orbit which logical repo configuration to use while still allowing
you to point at a specific checkout with `--repo-dir` if needed.

## 3. MCP

Orbit also exposes an MCP server over stdio.

Run it with:

```bash
node bundle/mcp-server.js
```

The MCP server is useful when another tool or agent wants structured Orbit
operations instead of shelling out to the CLI manually.

The current MCP tool surface includes:

- `mission_start`
- `mission_uplink`
- `mission_ci`
- `mission_peek`
- `mission_jettison`
- `constellation`
- `station_manage`
- `station_reap`
- `infra_liftoff`
- `infra_splashdown`
- `infra_manage`
- `config_install`

In practice:

- use CLI for explicit operator control
- use natural language when you want Gemini to choose the right Orbit action
- use MCP when you want tool-level structured integration

## Recommended Workflow

For most users:

1. Start with the CLI so you understand the actual command model.
2. Use natural language once the workflow feels familiar.
3. Use MCP when you are wiring Orbit into a larger agent or toolchain.

## Related Docs

- [Getting Started](./GETTING_STARTED.md)
- [Mission Guide](./MISSION.md)
- [Configuration](./CONFIGURATION.md)
- [Gemini Guidance](./GEMINI.md)
