# Summary: Orbit Refactor & CLI Streamlining 🛰️

This branch (`refactor/cli-hierarchy-and-structural-split`) implements a major
architectural refinement and UX overhaul to transform Gemini Orbit into a
professionally structured, entity-based platform.

## ✅ Accomplishments

### 1. Architectural Structural Split - COMPLETED

- **Bifurcation of Core**: Split the monolithic `src/core` into:
  - `src/sdk/`: Stateful Managers (`Mission`, `Fleet`, `Station`, `CI`,
    `Integration`) and the `OrbitSDK` facade.
  - `src/core/`: Stateless functional core (Constants, Types, TaskRunner,
    Logger, ConfigManager).
- **Symmetrical Peer Entry Points**:
  - `src/cli/cli.ts`: The human-facing interface.
  - `src/mcp/mcp.ts`: The model-facing interface.
- **Capsule Isolation**: Moved remote-execution logic to `src/capsule/`
  (`entrypoint.ts`, `worker.ts`), separating the control plane from the
  execution plane.
- **Cleanup**: Removed redundant legacy wrappers (`fleet.ts`, `jettison.ts`,
  etc.) and moved tests to their appropriate directories (`src/sdk/`,
  `src/capsule/`).

### 2. CLI & UX Overhaul (Noun-Verb Hierarchy)

- **Logical Pillars**: Streamlined the CLI into four entities:
  - **Mission**: The Workflow (`uplink`, `attach`, `ci`, `jettison`).
  - **Station**: The Hardware (`list`, `activate`, `hibernate`, `pulse`,
    `reap`).
  - **Infra**: The Foundation (`liftoff`, `splashdown`, `schematic`).
  - **Config**: The Local Environment (`install`).
- **Context Awareness**: Inside a capsule, the CLI now automatically resolves
  the Mission ID from `GCLI_ORBIT_MISSION_ID`, enabling commands like
  `orbit mission ci` without explicit IDs.
- **Improved Feedback**: Configured `yargs` to demand commands, show help on
  fail, and group global flags for high signal-to-noise.

### 3. PNI Automation (Networking & Idempotency) - COMPLETED

- **Full Stack Automation**: Implemented automated provisioning of VPC,
  Subnetwork, Cloud Router, and Cloud NAT, guarded by the `autoSetupNet` flag.
- **BeyondCorp Integration**: Automated firewall rules for corporate SSH relays
  (`172.253.30.0/23`).
- **Idempotency Guarantee**: Leveraging Pulumi Automation API to ensure
  re-running `liftoff` is safe and surgical.
- **Disk Compatibility**: Removed hardcoded `pd-ssd` to allow GCP to select
  optimal defaults (e.g., for N4 instances).
- **Interactive Networking Wizard**: Enhanced the schematic creation wizard to
  prompt for automated networking management and custom SSH source ranges.

### 4. MCP & Chat UI Integration

- **High-Fidelity Prompts**: Registered structured MCP Prompts (`mission`,
  `station`, `liftoff`) in `mcp.ts`.
- **Slash Commands**: Created TOML definitions in `commands/orbit/` to expose
  `/orbit:...` commands to users in the chat UI.
- **Strategic Guidance**: Created `docs/GEMINI.md` as a runtime mission protocol
  that teaches the LLM _why_ and _when_ to suggest Orbit.

### 4. Code Quality & Maintenance

- **Unit Testing - VERIFIED**: Verified all 96 unit tests across the new
  directory structure. Fixed `entrypoint.ts` worker reference and relocated
  `worker.test.ts`.
- **Bundling**: Updated `esbuild` logic in `tools/bundle.ts` to handle the new
  directory structure and renamed entry points.
- **Documentation**: Updated root `GEMINI.md` (Developer Guide), `LIFTOFF.md`,
  and `MANEUVERS.md`.

---

## 🔍 Verification Required

Before merging [PR #30](https://github.com/mattKorwel/gemini-cli-orbit/pull/30),
the following end-to-end flows must be verified in a real GCE environment:

### 1. Infrastructure (Infra) - VERIFIED

- [x] **Liftoff**: Run
      `orbit infra liftoff orbit-station-1 --schematic korwel-orbit-fresh`.
      Verified the VM provisions correctly and image pulls succeed.
- [x] **Networking**: Verified BeyondCorp SSH Relay connectivity using
      `nic0...internal.gcpnode.com` hostname.
- [x] **Cloud NAT**: Provisioned Cloud Router and NAT gateway to enable outbound
      connectivity for image pulls.
- [x] **Firewall**: Added rule for BeyondCorp SSH Relay (`172.253.30.0/23`).

### 2. Workflow (Mission)

- [ ] **Launch**: Start a mission via `orbit mission <ID> review`. Verify the
      parallel task runner initiates.
- [ ] **Capsule Intelligence**: Attach to a capsule and run `orbit mission ci`.
      Verify it monitors the correct branch without an explicit ID.
- [ ] **Uplink**: Run `orbit mission uplink`. Verify telemetry logs are fetched
      from the remote station.

### 3. Integration (MCP/Slash)

- [ ] **Slash Commands**: Type `/orbit:mission` in the Gemini CLI. Verify the
      template appears correctly.
- [ ] **Proactive LLM**: Ask the model to "Review my PR". Verify it suggests an
      Orbit mission based on the guidance in `docs/GEMINI.md`.

### 4. Cleanup

- [ ] **Jettison**: Run `orbit mission jettison`. Verify the capsule and
      worktree are removed.
- [ ] **Splashdown**: Run `orbit infra splashdown <name>`. Verify the station VM
      and receipt are fully decommissioned.
