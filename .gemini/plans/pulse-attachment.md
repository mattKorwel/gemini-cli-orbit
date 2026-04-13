# Implementation Plan: Orbit Pulse & Attachment Fixes 🛰️

## Objective

Restore accurate situational awareness and reliable session management for
missions by fixing naming mismatches, implementing missing hooks, and improving
telemetry aggregation.

## 🏗️ Phase 1: Fix Attachment & Naming

- **Problem**: `MissionManager` uses hyphenated names (`repo-id`) for
  re-attachment, but local tmux sessions use hierarchical names (`repo/id`).
- **Tasks**:
  - [x] Modify `src/sdk/MissionManager.ts`: Update `attach()` and the re-launch
        check in `start()` to use `provider.resolveIsolationId(mCtx)`.

## 🏗️ Phase 2: Fix Mission State & Hooks

- **Problem**: Gemini CLI isn't configured with Orbit hooks, leaving
  `state.json` at `IDLE`.
- **Tasks**:
  - [x] Modify `src/core/executors/GeminiExecutor.ts`: Add support for hook
        flags.
  - [x] Modify `src/station/capsule/mission.ts`: Inject hook flags into
        `GeminiExecutor.create` call.

## 🏗️ Phase 3: Fix Pulse Telemetry & Count

- **Problem**: `capturePane` is noisy in standard pulse output.
- **Tasks**:
  - [x] Modify `src/providers/LocalWorktreeProvider.ts`:
    - Implement `capturePane(name: string)` with sanitization.
  - [x] Modify `src/providers/BaseProvider.ts`: Make `peek` optional in
        `getMissionTelemetry`.
  - [x] Modify `src/sdk/StatusManager.ts`: Update `fetchFleetState` to always
        fetch mission counts for local stations.
  - [x] Modify `src/cli/cli.ts`:
    - Add `--peek` flag to `constellation` command.
    - Add `mission peek <id>` surgical command.

## 🏗️ Phase 4: UI Refinement & Help

- **Tasks**:
  - [ ] Update `src/cli/cli.ts`: Ensure `runConstellation` passes `args.peek` to
        `renderFleet`.
  - [ ] Update `src/cli/cli.ts`: Update help epilogues and command descriptions
        to include `peek`.

## 🏗️ Phase 5: Testing & Validation

- **Tasks**:
  - [x] Update `src/cli/ArgParsing.test.ts`.
  - [x] Add/Update `src/sdk/StatusManager.test.ts`.
  - [ ] **New**: Create `src/sdk/OrbitSDK.test.ts` to verify mission-level
        filtering and flag delegation.
  - [ ] Add integration test in `src/cli/cli.test.ts`.

## 🏗️ Phase 6: Documentation & MCP Update

- **Tasks**:
  - [ ] Update `docs/PULSE.md` and `docs/MISSION.md`.
  - [ ] Modify `src/mcp/mcp.ts` to expose `peek` capability.
  - [ ] Run `npm run sync-docs`.

## 🧪 Verification

1. **Pulse**: `orbit constellation --pulse` shows clean `THINKING/WAITING` +
   agent Intent.
2. **Peek**: `orbit constellation --pulse --peek` shows the terminal snapshots.
3. **Surgical Peek**: `orbit mission peek <id>` shows terminal snapshot for that
   mission.
4. **Count**: Verify `orbit constellation` (no flags) shows correct local
   mission count.
