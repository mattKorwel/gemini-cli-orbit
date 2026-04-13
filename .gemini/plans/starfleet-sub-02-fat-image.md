# Starfleet Sub-02: The Fat Image & Deployment 📦

## Objective

Standardize the remote environment and automate the "Freshness" cycle. This
phase eliminates the need to rsync core code and ensures the station is always
in sync with `gemini-cli` development.

## Key Files & Context

- **`orbit-capsule.Dockerfile`**: The blueprint for the unified image.
- **`.github/workflows/sentinel.yml`**: The "Sentinel" poller.
- **`.github/workflows/starfleet-image.yml`**: The image production pipeline.
- **`src/infrastructure/bootstrap-supervisor.sh`**: The host-side lifecycle
  script.

---

## 🛠️ Implementation Steps

### 1. Refactor `orbit-capsule.Dockerfile`

- **Base Layer:**
  `FROM us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest`.
- **Tooling:** Install `docker.io`, `tmux`, `git`, `rsync`, `gh`, and `jq`.
- **Injection:** Bundle the Orbit logic using `npm run bundle` and copy
  `bundle/` into `/usr/local/lib/orbit/bundle`.
- **Entrypoint:** Set the default CMD to
  `node /usr/local/lib/orbit/bundle/orbit-server.js`.

### 2. Implement the "Sentinel" Sentinel

- Create `.github/workflows/sentinel.yml`.
- Logic to poll the GCP Artifact Registry for the
  `gemini-cli/development:latest` image digest.
- Use GitHub Cache to store the "Last Known Digest."
- Trigger `starfleet-image.yml` on change.

### 3. Implement the Rebuild Pipeline

- Create `.github/workflows/starfleet-image.yml`.
- Build the Orbit bundle.
- Build the "Fat Image" ON top of the latest `gemini-cli` base.
- Push to GHCR as `ghcr.io/mattkorwel/gemini-cli-orbit:latest`.
- Tag with package version and short SHA.

### 4. Station Lifecycle Automation

- Implement `src/infrastructure/bootstrap-supervisor.sh`.
- Integrate Starfleet bootstrap into
  `src/infrastructure/targets/GcpCosTarget.ts`.
- Logic for the host VM to:
  1. Prepare ground truth directories on `/mnt/disks/data`.
  2. Fix permissions for `node:node` (1000:1000).
  3. `docker pull` the latest Starfleet image.
  4. Start the Supervisor container with DooD mounts.

---

## ✅ Verification

- **Docker Build:** Verify the "Fat Image" builds correctly and responds to
  `/health` in a container.
- **Sentinel Flow:** Manually trigger the Sentinel and verify it triggers the
  rebuild.
- **Bootstrap Test:** Verify the Pulumi-generated startup script contains the
  Starfleet logic.
