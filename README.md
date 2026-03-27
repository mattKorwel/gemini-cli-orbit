# Gemini Orbit 🚀

![CI](https://github.com/mattKorwel/gemini-cli-orbit/actions/workflows/test.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-38%20passed-green)

**Escape the gravity of terrestrial constraints.**

Gemini Orbit launches your development presence into high orbit—a persistent, high-performance environment that transcends the physical limits of your laptop's CPU, battery life, and sleep cycles. Your work should never stop just because your terrestrial machine did.

Orbit provides a **Persistent Orbital Presence**—a high-performance digital outpost that maintains its mission trajectory even when your terrestrial keyboard is powered down.

## 🌌 Why Orbit?

*   **Terrestrial Freedom**: Decouple your work from your physical hardware. Run heavy builds, exhaustive test suites, and complex tasks without spinning up local fans or being tethered to a power outlet.
*   **Persistent Orbital Presence**: Your environment stays alive in orbit. Disconnect from your terrestrial machine, close your laptop, and re-attach later from any device. Your shells, state, and progress remain in safe orbit exactly where you left them.
*   **Autonomous Missions**: Launch high-intelligence, autonomous missions that work for you while you're offline. Whether it's a multi-file refactor or a deep PR review, your Orbit executes independently and notifies you upon completion.
*   **Parallel Productivity**: Launch multiple "Mission Capsules" for different workstreams. Work on three things at once without your terrestrial machine slowing to a crawl.

---

## 📦 Installation

Install the Orbit extension directly via the Gemini CLI:

```bash
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git
```

---

## 🚀 Quick Start: Choose Your Mission Profile

Orbit supports two primary mission modes: **Local** (for maximum speed and low latency) and **Remote** (for massive scale and persistent persistence).

### 🏠 The Local Path (Multithreaded Development)
Launch isolated worktrees on your own machine. Perfect for juggling multiple PRs without the overhead of the cloud.

1.  **Configure Local Profile**:
    ```bash
    # Create a local profile using worktrees
    mkdir -p ~/.gemini/orbit/profiles
    echo '{"providerType": "local-worktree", "worktreesDir": "~/dev/orbit-worktrees"}' > ~/.gemini/orbit/profiles/local.json
    ```

2.  **Launch Local Mission**:
    ```bash
    /orbit:mission <pr-number> --profile=local
    ```

### 🛰️ The Remote Path (High-Performance Persistence)
Delegate heavy tasks to a persistent, high-performance GCE station. Your mission continues even if you close your laptop.

1.  **Liftoff**: Initialize your persistent **Orbital Station**.
    ```bash
    /orbit:liftoff
    ```

2.  **Launch Remote Mission**:
    ```bash
    /orbit:mission <pr-number>
    ```

---

## 📡 Mission Control Commands

*   **Pulse**: Monitor your **Orbital Presence**. See which missions (Local & Remote) are active and check station health.
    ```bash
    /orbit:pulse
    ```

*   **Attach**: Jump directly into a running mission capsule or worktree to take manual control.
    ```bash
    /orbit:attach <pr-number>
    ```

*   **Blackbox**: Stream live logs and monitor autonomous progress for a specific PR.
    ```bash
    /orbit:blackbox <pr-number>
    ```

---

## 🏗️ The Architecture of Orbit: Sovereign & Agnostic

Orbit is built on a **Hub & Spoke** model designed for speed, isolation, and total developer control.

### Supported Providers
Orbit is **Provider-Agnostic** by design. You can choose the environment that fits your current mission:

- **`local-worktree`**: (Default Local) Uses `git worktree` to create isolated, zero-overhead environments on your local disk. Compatible with the popular `go` worktree management workflow.
- **`gce`**: (Default Remote) Launches a persistent "Station" in Google Compute Engine using Capsule-Optimized OS.
- **`local-docker` / `podman`**: Runs isolated containers directly on your local machine.
- **`iap` / `direct-internal` / `external`**: Multiple connectivity strategies to reach your remote station across any network.

---

## 📖 Documentation

For in-depth guides, architectural diagrams, and detailed configuration, visit our **[Documentation Hub](docs/README.md)**.

---

## 🛡️ Standards & Security

*   **Process Isolation**: Every mission is sandboxed to ensure "it works on my machine" translates to the cloud.
*   **Read-Only Core**: Your primary repository clone is mounted read-only into capsules for safety.
*   **Telemetry**: Use `/orbit:blackbox <pr>` to stream logs and monitor autonomous background progress.

```bash
# Keep the station healthy
npm test
```

---

## ⚖️ Legal Disclaimer & Cost Warning

**Cloud Costs:** Orbit provisions and maintains real infrastructure (e.g., Google Compute Engine instances). Running persistent instances will incur hourly or monthly costs on your connected GCP billing account. You are responsible for monitoring and managing your cloud usage.

**Security & Liability:** This software connects to remote virtual machines via SSH/IAP and manages Docker environments. You are responsible for ensuring that your network boundaries (VPC, firewall rules) and IAM permissions meet your organization's security standards. As per the Apache 2.0 License, this software is provided "AS IS" without warranties of any kind.

