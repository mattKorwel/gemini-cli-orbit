# Starfleet Sub-03: The "Zero-Sync" Transition ⚡

## Objective

Finalize the redesign by converting the local SDK into a thin client and
implementing high-fidelity telemetry. This phase achieves the performance gains
of the redesign.

## Key Files & Context

- **`src/sdk/StarfleetClient.ts`**: The API gateway.
- **`src/providers/StarfleetProvider.ts`**: The thin provider implementation.
- **`src/providers/ProviderFactory.ts`**: The trigger for Starfleet mode.

---

## 🛠️ Implementation Steps

### 1. Integrate `StarfleetProvider`

- Finalize `src/providers/StarfleetProvider.ts` to implement the full
  `OrbitProvider` interface via API calls.
- Support `exec`, `listCapsules`, and `capturePane` through the
  `StarfleetClient`.

### 2. Provider Factory Trigger

- Update `ProviderFactory.ts` to instantiate `StarfleetProvider` when
  `providerType === 'starfleet'`.
- Assumption: The user has established an SSH tunnel to the station (port 8080).

### 3. Implement Side-by-Side Orchestration

- Add a mechanism in `MissionManager` or `OrbitSDK` to opt-in to Starfleet mode.
- If enabled, skip the legacy file-syncing (rsync, MD5) and configuration
  injection.
- Call `client.launchMission(manifest)` and transition immediately to Uplink.

### 4. Implement Real-Time Telemetry (Uplink)

- Implement a streaming log endpoint in the Supervisor
  (`GET /missions/:id/logs`).
- Update the local `orbit mission uplink` command to consume this stream via the
  `StarfleetClient`.

### 5. Implement "Shadow Mode" Override

- If `--dev` is present in the local CLI:
  1. Perform a surgical `rsync` of the local bundle to
     `/mnt/disks/data/dev/shadow-bundle.js`.
  2. Pass `isDev: true` in the mission manifest.
  3. Supervisor bind-mounts the shadow bundle over the mission entrypoint.

---

## ✅ Verification

- **Latency Benchmarking:** Measure the time from mission start to "Attached."
- **Shadow Mode Test:** Verify local code changes are reflected in the remote
  mission when using `--dev`.
- **Uplink Stability:** Ensure the log stream survives connection hiccups.
