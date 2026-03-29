# Plan: New Engineer Perspective Improvements

This plan addresses the "First Impressions" feedback regarding onboarding friction, resource governance, and cost transparency for the Gemini Orbit extension.

## 🎯 Objectives
- **Onboarding**: Close the documentation gap for new users.
- **Resource Governance**: Allow per-capsule CPU and Memory limits to prevent station starvation.
- **Transparency**: Provide real-time telemetry and timing for "Cold Start" operations.
- **Cost Management**: Define a strategy for automated resource cleanup (Auto-Reaper).

## 🛠️ Changes

### 1. Documentation (Onboarding)
- [x] Create `docs/DAY_IN_THE_LIFE.md`: A narrative guide for the standard developer workflow.
- [x] Update `README.md`: Add a "Documentation" section linking to all core guides.
- [x] Update `docs/ARCHITECTURE.md`: Add "Cost Management & The Auto-Reaper" section.
- [ ] Update `docs/PULSE.md`: Add diagnostic instructions for "Zombie Capsules."

### 2. Infrastructure & Throttling
- [x] Update `OrbitConfig` in `scripts/Constants.ts`: Add `cpuLimit` and `memoryLimit` fields.
- [x] Update `scripts/setup.ts`: Prompt for these limits during Design/Profile creation.
- [x] Update `scripts/RemoteProvisioner.ts`: Inject these limits into the `runCapsule` configuration.

### 3. Telemetry & UX
- [x] Enhance `OrbitProvider` Interface: Add `getCapsuleStats(name: string)`.
- [x] Implement Stats: `LocalDockerProvider` (via `docker stats`) and `GceCosProvider`.
- [x] Update `scripts/status.ts`: 
    - Display CPU/Mem usage per capsule.
    - Use clear state labels (`🧠 [THINKING]`, `✋ [WAITING]`, `💤 [IDLE]`).
- [x] Add Timers: Track and display duration for station provisioning and wakeup in `setup.ts`.

## 🧪 Verification
- [x] Run `npm test scripts/RemoteProvisioner.test.ts` to verify limit injection.
- [x] Run `npm run lint` to ensure code quality.
- [ ] Manual check of `orbit pulse` output format.
