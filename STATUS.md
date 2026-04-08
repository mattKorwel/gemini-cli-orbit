# Starfleet Redesign: Current Status 🛰️

## 🌌 Platform State: OPERATIONAL

The foundational "Starfleet" architecture is implemented and verified
end-to-end. We have successfully moved from local-heavy SSH orchestration to a
remote-first, API-driven model.

### 🏗️ Verified Infrastructure

- **Station `starfleet-zeta`**: Fully provisioned on GCE.
- **Universal Pathing**: `/mnt/disks/data` is the standardized ground truth for
  host, supervisor, and missions.
- **Hardware Lock**: Security posture is enforced via
  `/mnt/disks/data/.starfleet-dev-unlocked`.
- **Registry**: `ghcr.io/mattkorwel/gemini-cli-orbit:latest` is public and
  multi-arch (amd64 verified).

### 🧠 The Brain (Supervisor Daemon)

- **Standalone API**: Responds to `/health`, `/missions`, and `/exec`.
- **Mission Orchestrator**: Separated from API logic; handles host-side Git and
  manifest writing.
- **Zero-Sync**: Spawns mission containers in < 2 seconds.
- **Tunneling**: Port 8080 bridged automatically via SSH transport.

### 🌒 Development Flow (Shadow Mode)

- **Shadow Manager**: Discrete handler for `--dev` overrides.
- **Surgical Sync**: Overwrites the logic on the VM disk without image rebuilds.
- **Permission Safe**: Operates strictly as `node` user (UID 1000).

---

## 🛠️ Implementation Summary

- [x] **`src/station/server.ts`**: Standalone API entry point.
- [x] **`src/station/MissionOrchestrator.ts`**: High-fidelity mission lifecycle.
- [x] **`src/providers/StarfleetProvider.ts`**: Capability-based provider with
      smart 6-step UI.
- [x] **`src/sdk/StarfleetClient.ts`**: API gateway for the SDK.
- [x] **`src/sdk/ShadowManager.ts`**: Surgical dev-sync logic.
- [x] **`orbit-capsule.Dockerfile`**: Slim supervisor image (~200MB).
- [x] **PNI Integration**: Resilient startup script with GHCR retry logic.

---

## 🚀 Next Steps (Post-Restart)

1. **Schematic Finalization**: Ensure `korwel-orbit-fresh` schematic has
   `providerType: "starfleet"`.
2. **Definitive Launch**: Run `orbit mission start` on `starfleet-zeta` and
   confirm terminal attachment.
3. **Uplink Implementation**: Finalize real-time log streaming for background
   missions.
4. **Cleanup**: Decommission `starfleet-beta`, `starfleet-gamma`, etc.

## 🔑 Environment Context

- **Project ID**: `korwel-gcli-02-sandbox-676005`
- **Active Host**:
  `nic0.starfleet-zeta.us-central1-a.c.korwel-gcli-02-sandbox-676005.internal.gcpnode.com`
- **Local Port**: `8080` (requires SSH tunnel)
