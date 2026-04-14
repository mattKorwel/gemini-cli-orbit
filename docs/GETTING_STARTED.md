# Getting Started With Gemini Orbit

Gemini Orbit gives Gemini CLI a persistent execution environment for coding
work. Instead of tying long-running work to your laptop, Orbit launches a
mission that can keep running in a local worktree, in local Docker, or on a
remote station.

## What Orbit Is

Orbit is useful when you want:

- a persistent coding session you can re-attach to later
- an isolated workspace for a PR, issue, or branch
- a heavier execution environment than your local shell
- a way to drive work from direct CLI commands, natural language, or MCP tools

At a high level:

- the local `orbit` CLI is the control surface
- a station supervisor manages mission lifecycle
- each mission runs in its own workspace and execution environment

## Choose A Starting Path

### Local Worktree

Use this when you want the fastest local path and do not need Docker isolation.

```bash
orbit mission launch 123 chat --local
```

This starts a mission in a local git worktree and uses your machine's local
tooling.

### Local Docker

Use this when you want a local supervisor plus containerized mission execution.

```bash
orbit mission launch 123 chat --local-docker
```

This uses the local Starfleet flow and gives each mission a Docker-backed
runtime while still running on your machine.

### Remote Station (GCE)

Use this when you want persistent remote hardware for heavier work.

```bash
orbit infra liftoff my-station --schematic personal-gcp
orbit mission launch 123 chat --for-station my-station
```

If you are setting up a personal GCP environment from scratch, the repo
currently provides a prep script rather than a first-class `orbit infra prepare`
command:

```bash
npm run infra:gcp:prep
```

That script prepares a recommended personal-project schematic under
`~/.gemini/orbit/schematics/`.

## Installation

### 1. Install the Extension
Add Orbit to your Gemini CLI environment:

```bash
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git
```

### 2. Setup Shell Integration
Since the `orbit` command is provided by the extension, you must bootstrap it to your shell.

#### Option A: Natural Language (Recommended)
If you are already in a Gemini session with the Orbit extension loaded, simply ask:
> "Install the orbit shell integration"

This will automatically trigger the `config_install` tool to set up your aliases.

#### Option B: Direct Bootstrap
If you prefer the terminal, you can run the bundled CLI entry point directly from the extension folder to install the `orbit` shim:

```bash
node ~/.gemini/extensions/orbit/bundle/orbit-cli.js config install
```

Once installed, you can use the `orbit` command directly.

## Core Workflow

### 1. Launch A Mission

```bash
orbit mission launch 123 review
```

### 2. Re-attach Later

```bash
orbit mission attach 123 review
```

### 3. Inspect Mission State

```bash
orbit constellation --pulse
orbit mission uplink 123 review
orbit mission peek 123 review
```

### 4. Clean Up

```bash
orbit mission jettison 123 review
orbit infra splashdown my-station
```

## How To Think About The Command Surface

- `orbit mission ...` is your day-to-day workflow surface
- `orbit station ...` manages an existing station host
- `orbit infra ...` manages schematics and hardware provisioning
- `orbit config ...` manages local integration

## Next Reads

- [Commanding Orbit](./COMMANDING_ORBIT.md)
- [Configuration](./CONFIGURATION.md)
- [Mission Guide](./MISSION.md)
- [Liftoff](./LIFTOFF.md)
- [Manual Testing](./MANUAL_TESTING.md)
