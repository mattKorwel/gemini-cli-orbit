# Sub-Plan 6: Seamless Dependency Management

Ensure a "zero-friction" experience for end-users by automatically managing required binaries like Pulumi.

## Objective
- [ ] Implement `src/core/DependencyManager.ts` to handle binary discovery and installation.
- [ ] Integrate dependency checks into the `liftoff` flow.
- [ ] Create `docs/DEPENDENCIES.md` to clearly explain what is installed and where.

## Tasks
1. **Dependency Manager**:
   - Detect OS (Darwin/Linux) and Architecture (x64/arm64).
   - Check if `pulumi` is in System PATH or `~/.gemini/orbit/bin`.
   - Implement `downloadPulumi()` to fetch the latest SDK from `get.pulumi.com`.
   - Implement `ensurePulumi()` with a clear user prompt/notification.
2. **Integration**:
   - Update `src/core/setup.ts` to call `ensurePulumi()` before provisioning.
   - Update `GcpCosTarget.ts` to prioritize the local binary path.
3. **Documentation**:
   - Create `docs/DEPENDENCIES.md` detailing:
     - Why Pulumi is needed.
     - Where binaries are stored (`~/.gemini/orbit/bin`).
     - How to opt-out or use a system-wide installation.
   - Update `README.md` to link to the new guide.

## Verification
- `orbit liftoff` successfully prompts for/installs Pulumi if missing.
- Pulse and Mission commands work correctly after installation.
