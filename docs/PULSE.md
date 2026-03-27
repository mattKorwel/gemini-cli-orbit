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
- **PR Number**: The specific workstream being handled.
- **Mission Name**: The unique identifier for the capsule.
- **State**: Whether the mission is actively processing or waiting.

---

## 🛰️ Mission Intelligence (v1.4+)
For active PR missions, Pulse provides a deeper look into what the Gemini agent is doing:
- **🧠 [THINKING]**: The agent is actively processing a task or analyzing the PR.
- **⏳ [WAITING]**: The agent has completed its last task and is awaiting your next directive.
- **❌ [CRASHED/STALE]**: The mission requires intervention or manual restart.

## ✨ Use Cases
- **Health Check**: Ensure your station is responsive before launching a complex mission.
- **Cleanup Identification**: Find old mission capsules that you forgot to jettison.
- **Telemetry**: Monitor the progress of autonomous missions from your terrestrial machine.
