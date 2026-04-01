# Sub-Plan 4: CLI Lifecycle Integration

Integrate the `InfrastructureFactory` into the `orbit liftoff` process and connect provisioning to execution.

## Objective
- [ ] Refactor `runSetup` (Liftoff) to use `InfrastructureFactory`.
- [ ] Connect provisioning output to `OrbitProvider.ensureReady()`.
- [ ] Support `orbit liftoff --destroy` to decommission infrastructure via Pulumi.

## Tasks
1. **Liftoff Refactoring**: Update `src/core/setup.ts` to call `infrastructure.up()`.
2. **Connectivity Handover**: Pass the resulting `InfrastructureState` to the execution provider.
3. **Destruction Flow**: Update `src/core/fleet.ts` or a new command to handle `infrastructure.down()`.

## Verification
- `npm run typecheck` passes.
- Mocked tests for `runSetup` with the new flow.
