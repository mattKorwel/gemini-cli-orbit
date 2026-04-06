# Gemini Orbit 🚀

![CI](https://github.com/mattKorwel/gemini-cli-orbit/actions/workflows/test.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-91%20passed-green)

**Escape the gravity of terrestrial constraints.**

Orbit is a [Gemini CLI](https://github.com/google-gemini/gemini-cli) extension
that launches your development presence into a persistent, isolated orbital
environment — running on your local machine or a cloud station. Launch an
autonomous mission, close your laptop, and re-attach hours later exactly where
you left off.

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

## 🤖 The Primary Surface: Natural Language

Orbit is designed to be controlled directly from your **Gemini CLI (In-App)**
session. While a powerful CLI is available, the most natural way to manage your
missions is through natural language:

- _"Launch a review for PR #42"_
- _"How is my orbit looking?"_ (Triggers Constellation Pulse)
- _"Fix the CI failures on this branch"_
- _"Re-attach to mission 42"_
- _"Jettison all idle capsules"_

Every mission maneuver is a first-class tool call available to the agent.

---

## 🚀 Getting Started

Orbit supports two primary mission modes:

1. **Local Worktrees**: Lightweight local isolation using `git worktree`.
2. **Remote GCE Stations**: High-performance, isolated VM environments on Google
   Cloud.

See [DEPENDENCIES.md](./docs/DEPENDENCIES.md) for details on external tools and
Orbit's automatic dependency management.

---

## 📦 Installation

```bash
# 1. Install the extension
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git

# 2. Enable the orbit command and tab-completion
orbit install-shell

# Restart your terminal (or source ~/.zshrc / ~/.bashrc)
```

---

## 🚀 First Launch (Local, no cloud needed)

The fastest way to enter orbit — an isolated Mission Capsule for a PR, running
on your own terrestrial machine:

```bash
# Open an interactive Gemini session inside a clean workspace for PR #42
orbit mission launch 42 --local

# Or let Orbit autonomously review it for you
orbit mission launch 42 review --local

# Or just ask Gemini in the app:
# "Review PR 42 for me locally"
```

Orbit resolves the PR number to a branch, creates a sibling git worktree, and
drops you into a persistent `tmux` session inside it. Close the terminal — the
mission keeps running. Re-attach with `orbit attach 42`.

---

## 🛰️ The Remote Path (Persistent Station)

For heavy workloads or missions you want to outlive your terrestrial machine,
delegate to a persistent **Station**. (Currently implemented via Google Compute
Engine).

**One-time setup:**

```bash
# Design your infrastructure blueprint
orbit schematic create corp

# Achieve liftoff — provisions VPC, Station, and everything needed
orbit infra liftoff corp --manageNetworking
```

**Daily usage:**

```bash
# Wake up your existing station
orbit infra liftoff

# Then launch missions as normal
orbit mission 42 review
```

Your mission persists through disconnects, sleep cycles, and closed terminals.
Reconnect from anywhere:

```bash
orbit attach 42        # Re-dock to the live tmux session
orbit uplink 42        # Inspect telemetry without attaching
```

> See [Configuration](docs/CONFIGURATION.md) and [Liftoff](docs/LIFTOFF.md) for
> full cloud setup details.

---

## 🛸 Autonomous Mission Maneuvers

Orbit doesn't just provide infrastructure — it executes high-fidelity missions
autonomously.

| Command                               | What it does                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `orbit mission launch <pr> review`    | Parallelized PR analysis: fetches context, runs the build, performs a mandatory **Behavioral Proof**, outputs `final-assessment.md` |
| `orbit mission launch <pr> fix`       | Iterative CI repair — reads failures, patches code, re-runs until the mission is green                                              |
| `orbit mission launch <pr> implement` | Implements features or changes from issue descriptions, test-first                                                                  |
| `orbit mission launch <pr> chat`      | Interactive Gemini chat session inside the isolated Mission Capsule (default)                                                       |
| `orbit mission shell <pr>`            | Raw bash shell inside the capsule (sidecar terminal)                                                                                |

> See [Maneuvers](docs/MANEUVERS.md) for a phase-by-phase breakdown of each
> mission type.

---

## 📡 Telemetry & Monitoring

Stay informed about your missions, your station, and your CI status.

```bash
orbit ls                            # Orbital health check — all active stations and capsules
orbit constellation --pulse         # Deep-dive into active mission thoughts and stats
orbit ci [branch]                   # Monitor GitHub Actions CI status for any branch
orbit mission uplink <pr> [action]  # Inspect mission telemetry (local-first, falls back to remote)
orbit mission attach <pr>           # Re-dock to a running mission session
```

## 🧹 Mission Control & Cleanup

```bash
orbit mission jettison <pr>          # Decommission a specific capsule and its workspace
orbit mission reap                   # Auto-cleanup idle capsules based on inactivity
orbit infra splashdown --all         # Emergency shutdown of all active remote capsules
orbit infra schematic <list|create>  # Manage infrastructure blueprints
orbit station <list|pulse|delete>    # Manage Orbital Stations
```

**Global flags** (work with any command):

```bash
--local, -l           Force local workspace mode (no cloud)
--repo, -r <name>     Override the detected repository name
--for-station <name>  Target a specific Orbital Station
--schematic <name>    Use a specific infrastructure blueprint
```

---

## 📖 Go Deeper

| Doc                                        | What's in it                                                    |
| ------------------------------------------ | --------------------------------------------------------------- |
| [Day in the Life](docs/DAY_IN_THE_LIFE.md) | End-to-end walkthrough of a typical orbital dev day             |
| [Architecture](docs/ARCHITECTURE.md)       | Hub & Spoke model, capsule isolation, provider design           |
| [Maneuvers](docs/MANEUVERS.md)             | Phase-by-phase breakdown of review, fix, and implement missions |
| [Configuration](docs/CONFIGURATION.md)     | Schematics, networking, environment variables                   |
| [Liftoff](docs/LIFTOFF.md)                 | Full Station provisioning guide                                 |
| [Pulse](docs/PULSE.md)                     | Reading mission health and orbital telemetry                    |
| [Security](docs/SECURITY.md)               | Credential injection, isolation model, security best practices  |

---

## ⚖️ Cost & Legal

**Cloud Costs:** The Remote path provisions real cloud infrastructure (e.g.
Compute Engine stations). Running persistent instances will incur costs on your
cloud billing account. You are responsible for monitoring your cloud spend.

**Security:** Orbit connects to remote stations via SSH and manages Docker
capsules. Ensure your VPC, firewall rules, and IAM permissions meet your
organization's standards.

Provided under the Apache 2.0 License, "AS IS", without warranties of any kind.
