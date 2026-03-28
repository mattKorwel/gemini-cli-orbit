# Orbit Architecture: Sovereign Orbital Infrastructure

Orbit is designed to decouple your development presence from your physical hardware, allowing you to **Escape the Gravity** of terrestrial constraints like CPU limits, battery life, and network dependency.

## 🛰️ The Hub & Spoke Model

Orbit operates on a distributed architecture consisting of a persistent central station and ephemeral mission environments.

### 1. The Host Station (The Hub)
The **Orbital Station** is a persistent, high-performance host (typically running Container-Optimized OS) that acts as your primary digital outpost.
- **Persistence**: Maintains a large, high-performance data disk (`/mnt/disks/data`).
- **Identity**: Houses your shared credentials, shell aliases, and Gemini extensions.
- **Mirroring**: Maintains a "Source of Truth" mirror of your primary repositories.

### 2. Mission Capsules (The Spokes)
When you launch a mission (e.g., `/orbit:mission 123`), Orbit spawns an isolated **Mission Capsule**.
- **Isolation**: Every mission runs in its own process-isolated container.
- **Speed**: Uses **Git Reference Clones** against the Host Station's mirror, making checkouts nearly instantaneous.
- **Statelessness**: Capsules are ephemeral. You can "Jettison" them when a mission is complete without affecting the Host Station.

### 3. Shared State Strategy
Orbit synchronizes your terrestrial environment to the orbital environment via a shared configuration mount. This ensures that your UI themes, plugins, and custom logic are available in every mission capsule.

## 🔗 Persistence & Re-attachment
Unlike traditional remote environments, Orbit sessions are persistent. 
- You can **Attach** to a running mission from any terrestrial machine.
- If your local machine sleeps or loses power, the Mission Capsule continues its trajectory.
- Autonomous missions (like automated refactoring or deep reviews) run independently in the background.

## 🛡️ Security & Sovereignty
Orbit is **Sovereign Infrastructure**. You own the host, you own the network, and you own the data. 

### Hardened Isolation
- **Permissions**: The persistent Host Station data is protected with restrictive permissions (UID 1000, 770), ensuring only the mission user and capsule processes have access.
- **Network Sovereignty**: You connect directly to your own infrastructure. SSH access is restricted via configurable firewall rules (Step 1).
- **Read-Only Core**: The primary repository mirror is mounted **Read-Only** into mission capsules for maximum safety.

### Secure Secret Management
- **RAM-based Injection**: Sensitive credentials (like GitHub PATs) are injected into Mission Capsules via temporary RAM-based file mounts (`/dev/shm`), preventing them from leaking into system process lists or persistent logs.
- **Redaction**: GitHub tokens are never passed in `git clone` URLs, relying instead on the station's secure `.netrc` configuration.
- **Least-Privilege Scopes**: GCE instances are provisioned with granular IAM scopes (Logging, Monitoring, Storage) instead of broad Cloud Platform access.

### Defensive Execution
- **Input Sanitization**: All user-provided names for profiles and stations are sanitized to prevent path traversal and shell injection.
- **Safe Command Execution**: Remote commands are executed using argument arrays rather than raw shell strings, eliminating entire classes of shell injection vulnerabilities.
- **Policy Enforcement**: Fine-grained security rules in `.gemini/policies/` control what the orbital agent can and cannot do.
