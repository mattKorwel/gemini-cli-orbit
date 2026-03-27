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

## 🚀 Quick Start

> **Note**: This is the "happy path" for developers to quickly evaluate Orbit. For detailed enterprise configurations, see the [Documentation Hub](docs/README.md).

1.  **Liftoff**: Initialize your persistent **Orbital Station** and define your mission profile.
    ```bash
    /orbit:liftoff
    ```

2.  **Mission Control**: Launch an isolated, high-performance environment for a specific PR or task.
    ```bash
    /orbit:mission <pr-number>
    ```

3.  **Pulse**: Monitor your **Orbital Presence**. See which missions are active (both manual and autonomous) and check station health.
    ```bash
    /orbit:pulse
    ```

4.  **Attach**: Jump directly into a running mission capsule to take manual control.
    ```bash
    /orbit:attach <pr-number>
    ```

---

## 🏗️ The Architecture of Orbit: Sovereign & Agnostic

Orbit is built on a **Hub & Spoke** model designed for speed, isolation, and total developer control. Unlike managed services, you are the commander of your own constellation. Your Orbital Station lives in your own infrastructure—giving you absolute authority over your security, performance, and costs.

While we provide a first-class implementation for GCE, the Orbit architecture is **Cloud-Agnostic** by design. Users can implement their own **Station Providers** to launch into any environment.

*   **The Station (The Hub)**: A persistent, high-performance host instance that acts as your home base. Because you own the infrastructure, you decide the machine type, the region, and the security boundaries.
*   **Mission Capsules (The Spokes)**: Process-isolated containers spawned for specific tasks or PRs. They use **Reference Clones** to make new checkouts nearly instantaneous while keeping your environment clean and predictable.
*   **Shared State**: Your UI themes, shell aliases, and Gemini extensions are synchronized from your terrestrial environment to your Orbit via a shared configuration mount.

## 🛠️ Connectivity

Stay connected regardless of your terrestrial network:
- **`direct-internal`**: Maximum speed via VPC-internal DNS.
- **`secure-tunnel`**: Secure, zero-config access through Identity-Aware Tunnels (no public IP required).
- **`external`**: Standard public routing for maximum compatibility.

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
