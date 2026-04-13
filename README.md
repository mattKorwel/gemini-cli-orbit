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

## 🛰️ The Star Map (Starfleet Architecture)

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
- _"How is my fleet looking?"_ (Triggers `station pulse`)
- _"Fix the CI failures on this branch"_
- _"Attach to mission 42"_

---

## 🚀 Getting Started

### 1. Installation

```bash
# Install the extension
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git

# Enable the orbit command and tab-completion
orbit install-shell
```

### 2. Local Launch (No Cloud Needed)

Orbit can run a "Local Starfleet" using Docker on your own machine:

```bash
# Start a local mission for PR #42
orbit mission start 42 --local-docker

# Orbit automatically builds the worker image and ignites the capsule.
# Re-attach at any time:
orbit mission attach 42
```

### 🔭 Remote Missions (GCE)

For heavy workloads, achieve **Liftoff** to provision a persistent GCE station:

```bash
# Provision a new station
orbit infra liftoff my-station --manageNetworking

# Launch missions to that station
orbit mission start 42 --for-station my-station
```

---

## 🛸 Common Maneuvers

| Intent            | Command                             |
| :---------------- | :---------------------------------- |
| **Start Mission** | `orbit mission start <id> [action]` |
| **Attach**        | `orbit mission attach <id>`         |
| **Jettison**      | `orbit mission jettison <id>`       |
| **Pulse**         | `orbit station pulse`               |
| **Liftoff**       | `orbit infra liftoff [name]`        |
| **Splashdown**    | `orbit infra splashdown --all`      |

---

## 📖 Documentation

| Doc                                  | Description                             |
| :----------------------------------- | :-------------------------------------- |
| [Missions](docs/MISSION.md)          | Deep dive into mission lifecycles       |
| [Architecture](docs/ARCHITECTURE.md) | The Starfleet model and logical pillars |
| [Roadmap](docs/ROADMAP.md)           | Upcoming features and priorities        |
| [Security](docs/SECURITY.md)         | Isolation and credential management     |

---

## ⚖️ License

Provided under the Apache 2.0 License. See [LICENSE](LICENSE) for details.
