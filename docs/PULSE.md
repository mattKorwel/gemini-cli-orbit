# Orbit Mission Control: Pulse (orbit pulse)

The **Pulse** command provides real-time telemetry and health monitoring for
your Orbital environment. It gives you a high-level view of your active station
and all mission capsules.

## 📡 Monitoring Your Orbit

Run the command to see the current state of your Mission Control:

```bash
orbit pulse
```

### 1. Station Health

Pulse reports the core status of your active outpost:

- **Station State**: (RUNNING, STOPPED, PROVISIONING, etc.)
- **Connectivity**: Internal IP address and active backend.
- **Station Name**: The identifier for your Cloud or Local host.

### 2. Active Mission Capsules

Pulse lists all mission environments currently running. For each active mission,
it shows:

- **State**: The current status of the Gemini agent (Thinking, Waiting, or
  Idle).
- **ID**: The unique identifier for the mission (e.g., `feat-test-1`).
- **Resource Usage**: Real-time CPU and Memory consumption (Remote only).

---

## 🛰️ Mission Intelligence

For active missions, Pulse provides a deeper look into what the Gemini agent is
doing:

- **🧠 [THINKING]**: The agent is actively processing a task or running a build.
- **✋ [WAITING]**: The agent is awaiting your input or manual approval.
- **💤 [IDLE]**: The mission is active but no agent is currently running.

## 🆘 Troubleshooting

If a mission environment becomes unresponsive:

1. Identify the mission ID in `orbit pulse`.
2. Use `orbit jettison <ID>` to surgically remove the resources.
3. Re-launch the mission if needed.

## ✨ Use Cases

- **Health Check**: Ensure your station is responsive before launching a complex
  mission.
- **Cleanup Identification**: Find old mission worktrees you forgot to jettison.
- **Telemetry**: Monitor the progress of autonomous maneuvers.

---

_Note: In the Gemini App, you can also use the `/orbit:pulse` slash command._
