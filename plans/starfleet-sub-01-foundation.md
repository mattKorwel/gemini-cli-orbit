# Starfleet Sub-01: The Foundation (Supervisor & Image) 🏗️

> **Focus:** Bootstrapping the remote "Brain" and its containerized environment
> without impacting existing logic.

## Objective

Establish the containerized **Station Supervisor (Daemon)**, the **"Fat Image"**
that houses it, and the **CI/CD pipeline** to build/push it. This is the
foundation that enables the remote-first architecture.

## Key Files & Context

- **`src/station/server.ts`**: (New) The Supervisor API entry point.
- **`orbit-capsule.Dockerfile`**: (Revised) Unified image for both Supervisor
  and Mission Capsules.
- **`.github/workflows/starfleet-image.yml`**: (New) GitHub Action to build/push
  the Orbit image to GHCR.
- **`src/test/StarfleetHarness.ts`**: (New) Behavioral test harness for verified
  spawning and FS interactions.

---

## 🛠️ Implementation Steps

### 1. Build the Starfleet Test Harness

- Implement `src/test/StarfleetHarness.ts` to provide a real filesystem sandbox
  and PATH-based command interception.
- This will be used to verify the Supervisor's orchestration logic without
  needing a real Docker/Git environment.

### 2. Refactor the Docker Blueprint

- Update `orbit-capsule.Dockerfile` to be a "Fat Image" that inherits from
  `gemini-cli:latest`.
- Inject the Orbit bundle (`bundle/orbit-cli.js`) into `/usr/local/bin/orbit`.
- Ensure all required tools (Docker, Git, Tmux, rsync) are installed.
- Set the default command to launch the `orbit server`.

### 3. Implement the Station Supervisor (Daemon)

- Create a lightweight server in `src/station/server.ts`.
- **Logic:** It must handle the `MissionManifest` JSON contract and manage
  sibling mission capsules via the host's Docker socket.
- **Focus:** Keep it isolated and independently testable. It should use the new
  `StarfleetHarness` for verification.

### 4. Setup CI/CD Pipeline

- Create `.github/workflows/starfleet-image.yml`.
- Logic to:
  - Rebuild the Orbit bundle.
  - Build the "Fat Image" on top of the latest `gemini-cli`.
  - Push to GitHub Container Registry (GHCR) as
    `ghcr.io/mattkorwel/orbit:latest`.

### 5. Local Validation

- Run the Supervisor locally in a container.
- Use `curl` or a temporary script to send a JSON manifest and verify it
  attempts to spawn a sibling capsule (tracked via the test harness or Docker
  socket).

---

## ✅ Verification

- **Test Harness:** All 127 existing tests pass, plus new tests for the
  `StarfleetHarness` itself.
- **Image Build:** Successful `docker build` and manual verification of the
  `/usr/local/bin/orbit` binary inside the image.
- **API Connectivity:** Successful `GET /health` call to a locally running
  Supervisor container.
