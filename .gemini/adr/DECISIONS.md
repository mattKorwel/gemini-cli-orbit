# Orbit: Architectural Decision Log

This document summarizes the core architectural decisions that define the Orbit platform. For historical context, see the `.gemini/adr/archive/` directory.

---

## 🏗️ 1. Hub & Spoke Model
**Decision**: Separate the persistent host station (The Hub) from the ephemeral mission environments (The Spokes).
- **Rationale**: Decouples long-term state (creds, large repos, global config) from short-term PR-specific work. Ensures that a crash in one mission does not affect the primary station or other missions.

## 📦 2. Multi-Capsule Isolation (Docker)
**Decision**: Every mission session runs in a dedicated, process-isolated Docker container.
- **Rationale**: Provides absolute environment parity. Ensures "it works on my machine" translates to the cloud without dependency conflicts between different PRs.

## ⚡ 3. Git Reference Clones
**Decision**: Use `git clone --reference` against a read-only mirror on the Host Station.
- **Rationale**: Allows new mission environments to be provisioned in seconds, as objects are shared via the host's disk instead of being re-downloaded over the network.

## 🔗 4. Shared State Strategy
**Decision**: Mount the Host Station's configuration directory into **every** capsule.
- **Rationale**: Ensures a consistent developer experience. Extensions linked in one capsule are immediately available in all others. UI themes, shell aliases, and credentials remain unified.

## ⚙️ 5. Named Profile System
**Decision**: Implement a tiered resolution hierarchy using named JSON profiles (e.g., `corp`, `sandbox`).
- **Rationale**: Allows developers to switch seamlessly between different infrastructure targets (GCP projects, VPCs, Regions) without reconfiguring individual repositories.

## 🛰️ 6. Station Provider Abstraction
**Decision**: All infrastructure logic is encapsulated in a `StationProvider` interface.
- **Rationale**: Makes the platform cloud-agnostic. While GCE is the primary implementation, new providers (AWS, Local Docker, etc.) can be added without modifying the core orchestration logic.

## 🧵 7. Persistent Tmux Wrapping
**Decision**: All mission sessions are executed within `tmux` inside the capsule.
- **Rationale**: Provides resilience against terrestrial connection drops. Developers can disconnect, close their laptops, and re-attach later without losing their shell state or running processes.

## 🛡️ 8. Read-Only Core
**Decision**: The primary "Source of Truth" repository on the Host Station is mounted **Read-Only** into Mission Capsules.
- **Rationale**: Protects the main mirror from accidental corruption or malicious modification by an autonomous agent.

## 🔭 9. Consolidated Review Mission
**Decision**: Unify all PR review activities into a single, repo-agnostic, parallelized TypeScript mission.
- **Rationale**: Eliminates fragmentation, enforces "Behavioral Proof" (physically exercising code), and ensures all context (PR description + 3-level issue hierarchy) is utilized for the final assessment.

## 📂 10. Temporary Output Management & Session Lifecycle
**Decision**: Standardize transient data storage (scripts, logs) using a configurable, session-isolated `tempDir`.
- **Rationale**: Prevents name collisions during concurrent missions. Ensures all mission-specific artifacts are bundled together, facilitating both easier debugging (when `autoClean` is false) and deterministic cleanup.
