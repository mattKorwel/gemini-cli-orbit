# Orbit Mission Control: Constellation (orbit constellation)

The **Constellation** command provides unified fleet-wide telemetry and health
monitoring. It serves as your primary Mission Control dashboard, showing you
exactly what is happening across your hardware and active missions.

## 🌌 The Fleet View

Run the command to see the current state of your constellation:

```bash
orbit constellation
```

### 🛰️ Intelligent Filtering

By default, **Constellation** is context-aware:

- **Inside a Repository**: Shows only stations and missions associated with that
  project.
- **Outside a Repository**: Shows your entire global fleet.
- **Override**: Use `--all` (or `-a`) to see everything regardless of your
  current directory.

### 🔍 Search and Filtering

- **By Name**: `orbit constellation -n "remote-*"` filters by station name
  pattern.
- **Specific Repo**: `orbit constellation -r my-project` targets a specific
  project.

---

## 📡 Monitoring Depths

You can control the amount of "Reality Sync" performed by using different flags:

### 1. Inventory View (Default)

Fast and lightweight. Shows what is registered in your local receipts.

```bash
orbit constellation
```

### 2. Health View (`--sync`)

Pings the hardware to verify real-time status (Running, Stopped, etc.) and
retrieves IPs.

```bash
orbit constellation --sync
```

### 3. Monitoring View (`--pulse`)

The deepest dive. Connects to the station to fetch real-time telemetry from
every active mission capsule.

```bash
orbit constellation --pulse
```

---

## 🛰️ Mission Intelligence

When using `--pulse`, you gain insight into exactly what the Gemini agent is
doing:

- **🧠 [THINKING]**: The agent is actively processing a task or running a build.
- **✋ [WAITING]**: The agent is awaiting your input or manual approval.
- **💤 [IDLE]**: The mission is active but no agent is currently running.

## 🆘 Troubleshooting

If a mission environment becomes unresponsive:

1. Identify the mission name in `orbit constellation --pulse`.
2. Use `orbit mission jettison <ID>` to surgically remove the resources.
3. Re-launch the mission if needed.

---

_Note: In the Gemini App, you can also use the `/orbit:constellation` slash
command._
