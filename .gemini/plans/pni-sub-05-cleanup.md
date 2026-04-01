# Sub-Plan 5: Verification & Cleanup

Purge legacy imperative provisioning code and verify the new end-to-end flow.

## Objective
- [ ] Remove legacy `provision` and `setup` methods from `OrbitProvider`.
- [ ] Remove imperative `gcloud` provisioning calls from `GceCosProvider.ts`.
- [ ] Update tests to reflect the simplified provider interface.

## Tasks
1. **Interface Cleanup**: Remove `provision` and `setup` from `src/providers/BaseProvider.ts`.
2. **Provider Purge**: Delete the implementation of these methods in `GceCosProvider.ts` and `LocalWorktreeProvider.ts`.
3. **Internal Helper Removal**: Remove `GceConnectionManager.setupNetworkInfrastructure` and other legacy network helpers.
4. **Test Alignment**: Update all provider tests to focus on execution rather than provisioning.

## Verification
- `npm run typecheck` passes.
- All 118 tests pass with simplified mocks.
