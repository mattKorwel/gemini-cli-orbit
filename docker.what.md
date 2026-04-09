# Starfleet Diagnosis Summary 🛰️

## What we've been diagnosing

We are finalizing the **Starfleet architecture**, where a remote "Supervisor"
container orchestrates isolated "Worker" capsules on a GCE host. We've been
troubleshooting why missions fail to "ignite" (spawn and stay running).

### Key Issues Identified & Resolved:

1.  **DNS & Hostname Resolution**: Stale "Station Receipts" were clobbering
    updated Schematic settings. This led to incorrect hostnames (double
    `.internal.internal`).
    - _Fix_: Corrected merge order in `ContextResolver` (Blueprint > Cache) and
      fixed string construction in `SSHManager`.
2.  **Docker Socket Permissions**: The `node` user in the supervisor container
    couldn't talk to the host's `/var/run/docker.sock`.
    - _Fix_: Updated `GcpCosTarget` startup script to `chmod 666` the socket.
3.  **Manifest Catch-22**: Workers couldn't find their mission manifest because
    it was stored in a path they hadn't resolved yet.
    - _Fix_: Aligned on isolated RAM-disk mounting. Supervisor writes to
      `/dev/shm/orbit-manifest-${id}.json` on the host, which is mounted
      directly to `/home/node/.orbit-manifest.json` inside the capsule.
4.  **Shadow Sync Mismatches**: Local code changes (like the manifest fix)
    weren't reaching the remote supervisor or workers because the "Shadow Mode"
    rsync was placing files in the wrong subdirectories or skipping them.
    - _Fix_: Corrected `rsync` paths and trailing slashes in `ShadowManager`.
5.  **Image Fallback Bug**: Missions were defaulting to the heavy supervisor
    image instead of the optimized 800MB `orbit-worker`.
    - _Fix_: (Pending final verification) Corrected fallback logic in
      `DockerManager` to use the hydrated `workerImage`.

## Current Testing Commands

### 1. Launch Mission

```bash
npm run mission:dev -- <mission-id> chat --for-station starfleet-omega
```

- **Why**: Verifies the full chain: Local CLI -> Shadow Sync -> Remote API ->
  Orchestration -> Docker Spawn.

### 2. Inspect Supervisor (The Brain)

```bash
# View orchestration logs
ssh -i ~/.ssh/google_compute_engine mattkorwel_google_com@nic0.starfleet-omega... "sudo docker logs station-supervisor"

# Enter supervisor container
npm run station:supervisor
```

- **Why**: Essential for seeing why the API accepted a mission but the container
  failed to appear.

### 3. Inspect Capsule (The Worker)

```bash
# See all containers (including crashed ones)
ssh ... "sudo docker ps -a"

# Read capsule logs
ssh ... "sudo docker logs orbit-<mission-id>"
```

- **Why**: Tells us why `gemini` or `mission.js` failed inside the isolated
  environment (e.g., status 1 errors).

### 4. Deep Environment Debug

```bash
ssh ... "sudo docker commit orbit-<id> debug-img && sudo docker run -it --rm -v /mnt/disks/data:/mnt/disks/data debug-img /bin/bash"
```

- **Why**: Lets us step inside a "failed" mission state to manually run commands
  and check for missing paths or dependencies.

## Next Steps after Restart

- Verify `DockerManager` is correctly defaulting to `orbit-worker:latest`.
- Verify `gemini` binary availability in the optimized worker image.
- Finalize the automated `attach` logic now that naming is aligned.
