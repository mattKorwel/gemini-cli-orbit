# Orbit Mission Control: Pulse (/orbit:pulse)

The **Pulse** command provides real-time telemetry and health monitoring for your Orbital environment. It gives you a high-level view of your persistent station and all active mission capsules.

## 📡 Monitoring Your Orbit
Run the command to see the current state of your Mission Control:
```bash
/orbit:pulse
```

### 1. Host Station Health
Pulse reports the core status of your primary digital outpost:
- **Station State**: (RUNNING, STOPPED, PROVISIONING, etc.)
- **Connectivity**: Internal IP address and active backend (direct-internal, secure-tunnel, etc.)
- **Station Name**: The identifier for your GCE/custom host.

### 2. Active Mission Capsules
Pulse lists all ephemeral mission environments currently running on the host. For each active mission, it shows:
- **State**: The current status of the Gemini agent (Thinking vs Waiting).
- **Capsule Name**: The unique identifier for the mission environment (e.g., `gcli-123-mission`).
- **Resource Usage**: Real-time CPU and Memory consumption (e.g., `CPU: 12.5%, Mem: 1.2GB / 8GB`).

---

## 🛰️ Mission Intelligence (v1.5+)
For active PR missions, Pulse provides a deeper look into what the Gemini agent is doing:
- **🧠 [THINKING]**: The agent is actively processing a task, running a build, or analyzing the PR.
- **✋ [WAITING]**: The agent is awaiting your input or a manual approval.
- **💤 [IDLE]**: The capsule is active but no agent or TMUX session is currently running.

## 🆘 Troubleshooting & "Zombie" Capsules
Sometimes a mission environment can become unresponsive or "zombie" if a process crashes internally. 

### Identifying a Zombie
Check the resource usage in `pulse`. If a capsule shows **0% CPU** and **Static Memory** while you expect it to be working, it may be a zombie.

### The Surgical Kill
To kill a specific capsule without affecting your Host Station or other missions:
```bash
orbit jettison <pr-number>
```
This will physically remove the Docker container and clean up its associated worktree, allowing you to re-launch the mission cleanly.

## ✨ Use Cases
- **Health Check**: Ensure your station is responsive before launching a complex mission.
- **Cleanup Identification**: Find old mission capsules that you forgot to jettison.
- **Telemetry**: Monitor the progress of autonomous missions from your terrestrial machine.
