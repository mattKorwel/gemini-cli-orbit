# Gemini Orbit 🚀

![CI](https://github.com/mattKorwel/gemini-cli-orbit/actions/workflows/test.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-Behavioral_Verified-green)
![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-blue)

**Escape the gravity of terrestrial constraints.**

Gemini Orbit is a [Gemini CLI](https://github.com/google-gemini/gemini-cli)
extension and **self-hosted, elastic compute service** designed specifically for
agentic engineering work. It launches your development presence into a
persistent, **isolated orbital environment** across **Linux, macOS, and
Windows**.

Built around a **Starfleet-inspired conceptual model**, Orbit orchestrates
lightweight worker capsules via a remote or local supervisor API. Launch a
mission, close your laptop, and re-attach later exactly where you left off.

Start with the full docs:

- [Getting Started](docs/GETTING_STARTED.md)
- [Full Documentation Index](docs/README.md)
- [Commanding Orbit: CLI, MCP, and Natural Language](docs/COMMANDING_ORBIT.md)

## 🌌 Why Orbit?

- **Terrestrial Freedom**: Decouple your work from your physical hardware. Run
  heavy builds, exhaustive test suites, and complex tasks without spinning up
  local fans or being tethered to a power outlet.
- **Persistent Orbital Presence**: Your environment stays alive in orbit.
  Disconnect from your terrestrial machine, close your laptop, and re-attach
  later from any device — your shells, state, and progress are exactly where you
  left them.
- **Autonomous Missions**: Launch high-intelligence missions that work for you
  while you're offline. Whether it's a multi-file refactor or a deep PR review,
  your Orbit executes independently and surfaces results when complete.
- **Parallel Productivity**: Run multiple isolated Mission Capsules for
  different workstreams simultaneously — without your terrestrial machine
  slowing to a crawl.

---

## 🛰️ The Star Map

Orbit uses a unified, API-driven model that maps space-themed roles to specific
technical components:

| Space Term             | Technical Role        | Description                                                        |
| :--------------------- | :-------------------- | :----------------------------------------------------------------- |
| **Fleet Commander**    | **Local CLI / SDK**   | Orchestrates infrastructure and monitors mission progress.         |
| **Station Supervisor** | **Control Plane API** | A lightweight Node.js API that manages missions and hardware.      |
| **Agent Satellite**    | **Isolated Worker**   | Docker containers (Capsules) where the actual engineering happens. |

- **Unified Pathing**: Standardized `/orbit` root across all environments for
  seamless portability.

---

## 🤖 Natural Language Command

Orbit is designed to be controlled directly from your **Gemini CLI** session:

- _"Launch a review for PR #42"_
- _"How is my fleet looking?"_ (Triggers `orbit constellation --pulse`)
- _"Fix the CI failures on this branch"_
- _"Attach to mission 42 review"_

---

## 🚀 Getting Started

For the complete walkthrough, see [Getting Started](docs/GETTING_STARTED.md).

### 1. Installation

```bash
# Install the extension
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git

# Setup shell integration (bootstrap the 'orbit' command)
node ~/.gemini/extensions/orbit/bundle/orbit-cli.js config install
```

### 2. Local Launch (No Cloud Needed)

Orbit can run missions directly on your own machine:

```bash
# Start a local mission for PR #42
orbit mission launch 42 chat --local

# Re-attach at any time:
orbit mission attach 42
```

### 🔭 Remote Missions (GCE)

For heavy workloads, achieve **Liftoff** to provision a persistent GCE station:

```bash
# Prepare a personal-project schematic if you have not already
npm run infra:gcp:prep

# Provision a new station from a schematic
orbit infra liftoff my-station --schematic personal-gcp

# Launch missions to that station
orbit mission launch 42 chat --for-station my-station
```

### 🤖 Natural Language

Orbit is designed to be controlled directly from your Gemini CLI session.
For more details, see [Commanding Orbit: CLI, MCP, and Natural Language](docs/COMMANDING_ORBIT.md).

---

## 🛸 Common Maneuvers

| Intent            | Command                              |
| :---------------- | :----------------------------------- |
| **Start Mission** | `orbit mission launch <id> [action]` |
| **Attach**        | `orbit mission attach <id>`          |
| **Jettison**      | `orbit mission jettison <id>`        |
| **Pulse**         | `orbit constellation --pulse`        |
| **Liftoff**       | `orbit infra liftoff [name]`         |
| **Splashdown**    | `orbit infra splashdown --all`       |

---

## 📖 Documentation

| Doc                                          | Description                                          |
| :------------------------------------------- | :--------------------------------------------------- |
| [Getting Started](docs/GETTING_STARTED.md)   | What Orbit is, why to use it, and how to begin       |
| [Full Documentation Index](docs/README.md)   | Table of contents for the full docs set              |
| [Commanding Orbit](docs/COMMANDING_ORBIT.md) | How to use Orbit from CLI, MCP, and natural language |
| [Mission Guide](docs/MISSION.md)             | Deep dive into mission lifecycle and commands        |
| [Configuration](docs/CONFIGURATION.md)       | Schematics, registry, and configuration layering     |
| [Architecture](docs/ARCHITECTURE.md)         | The Starfleet model and runtime structure            |
| [Testing & Validation](docs/TESTING.md)      | Smoke-test and operator validation flows             |
| [Security](docs/SECURITY.md)                 | Isolation and credential management                  |

---

## ⚖️ License

Provided under the Apache 2.0 License. See [LICENSE](LICENSE) for details.
