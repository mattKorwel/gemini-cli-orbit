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
  Subnetwork, Cloud Router, and Cloud NAT, guarded by the `manageNetworking`
  flag.
- **BeyondCorp Integration**: Automated firewall rules for corporate SSH relays
  (`172.253.30.0/23`) and enforced mandatory `nic0.` internal hostname routing.
- **Idempotency Guarantee**: Leveraging Pulumi Automation API to ensure
  re-running `liftoff` is safe and surgical.
- **Disk Compatibility**: Removed hardcoded `pd-ssd` to allow GCP to select
  optimal defaults; implemented 500GB dedicated data disk for workspaces and
  mirrors.

### 4. CLI & UX Enhancements - COMPLETED

- **Terminology Migration**: Transitioned from "Worktree" to "Workspace" for
  remote missions to better reflect full-clone isolation.
- **New Commands**: Added `orbit config show` and
  `orbit infra schematic <name> --show` for better environment transparency.
- **Noise Suppression**: Implemented aggressive `gcloud` noise filtering to
  suppress "Existing host keys found" and other informational messages.
- **Isolated Networking**: Implemented station-specific naming for managed VPCs
  (`orbit-vpc-<station>`) to ensure safe and clean decommissioning.

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

- [x] **Internal Liftoff**: Verified full-stack (VPC, NAT, VM) provisioning with
      BeyondCorp.
- [x] **External Liftoff**: Verified provisioning on existing `default` VPC with
      public IP.
- [x] **Storage**: Implemented and verified dedicated 500GB data disk with
      auto-mounting.
- [x] **Networking**: Verified BeyondCorp SSH Relay connectivity using
      `nic0...internal.gcpnode.com` hostname.

### 2. Workflow (Mission) - VERIFIED

- [x] **Launch**: Verified mission initialization and remote worktree setup.
- [x] **Branch Intelligence**: Restored smart branch handling (auto-create
      missing branches).
- [x] **Capsule Intelligence**: Attached to capsule and verified "Sticky
      Station" default resolution.
- [x] **Mirroring**: Verified automatic host-side mirror provisioning for fast
      clones.
- [x] **Uplink**: Verified telemetry logs and enhanced pulse output.

### 3. Integration (MCP/Slash) - VERIFIED

- [x] **Slash Commands**: Verified TOML definitions and chat UI integration.
- [x] **Proactive LLM**: Model correctly suggests Orbit missions based on
      `docs/GEMINI.md`.

### 4. Cleanup - VERIFIED

- [x] **Jettison**: Verified surgical removal of capsules and remote worktrees.
- [x] **Splashdown**: Verified full decommissioning of VM, Networking, and Local
      Receipts.
