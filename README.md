# Gemini Orbit Extension 🚀

![CI](https://github.com/mattKorwel/gemini-orbit-extension/actions/workflows/test.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-38%20passed-green)

High-performance remote missions for Gemini CLI. Delegate heavy tasks—autonomous fixes, long builds, and complex PR reviews—to isolated, high-performance GCE stations.

## 📦 Installation

Install the extension directly from GitHub.

```bash
gemini extensions install https://github.com/mattKorwel/gemini-orbit-extension
```

> **Note**: Restart your Gemini CLI session after installation to activate the new commands.

## 🚀 Quick Start

1.  **Liftoff**: Initialize your environment for the current repository. This will guide you through creating a **Profile** (e.g., `corp` or `sandbox`) and provisioning your station.
    ```bash
    /orbit:liftoff
    ```

2.  **Pulse**: Check the health of your station and see all active mission capsules.
    ```bash
    /orbit:pulse
    ```

3.  **Mission**: Launch or resume an isolated mission for a PR.
    ```bash
    /orbit:mission 23176
    ```

4.  **Jettison**: Surgically remove a specific mission when finished.
    ```bash
    /orbit:jettison 23176 mission
    ```

---

## ✨ Core Concepts

### 🛰️ The Station
A persistent GCE worker running Container-Optimized OS that houses all your missions. It maintains a persistent data disk for lightning-fast operations.

### 📦 Mission Capsules
Isolated Docker containers spawned for each PR session. They provide process-level isolation and ensure that "it works on my machine" translates perfectly to the remote environment.

### 🔗 The Constellation
Manage multiple stations across different GCP projects and zones with the `/orbit:constellation` command.

---

## 🏗️ Architecture: Hub & Spoke

The system utilizes a "Hub and Spoke" model for maximum performance and efficiency:
- **Station Supervisor**: A persistent capsule that acts as the "Home Base" for shared configuration, credentials, and global extensions.
- **Mission Capsules**: Ephemeral, isolated environments created for every PR.
- **Reference Clones**: Uses `git clone --reference` against a read-only master clone to make new mission checkouts nearly instantaneous.

### Shared State Strategy
- **Persistent Disk**: Standardized on a 200GB+ PD-Balanced disk at `/mnt/disks/data`.
- **Unified Config**: The station's configuration is mounted into **every** capsule, ensuring extensions, UI themes, and aliases are synchronized across all missions.

---

## 🛠️ Connectivity Backends

- **`direct-internal`**: Fastest. Uses VPC-internal DNS hostnames.
- **`iap`**: Most secure. Tunnels SSH through GCP Identity-Aware Proxy. No public IPs or VPNs needed.
- **`external`**: Uses the instance's Public IP.

---

## 🛡️ Security & Engineering Standards

- **Orbit Policies**: Fine-grained security rules located in `.gemini/policies/`.
- **Read-Only Master**: The primary repository clone is always mounted **Read-Only** into mission capsules.
- **Blackbox**: Stream logs and mission data using `/orbit:blackbox <pr>`.
- **Testing**: Comprehensive Vitest suite covering all providers and configuration logic.

```bash
npm test
```
