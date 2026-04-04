# Sub-Plan 3: Execution Provider Refactoring

Update the `OrbitProvider` implementations to consume the new
`InfrastructureState` instead of managing their own infrastructure logic.

## Objective

- [ ] Refactor `BaseProvider.ts` to accept `InfrastructureState`.
- [ ] Update `GceCosProvider.ts` to use state for connectivity.
- [ ] Update `LocalWorktreeProvider.ts` to use state for local paths.

## Tasks

1. **Base Provider**: Update `OrbitProvider` interface or constructor to receive
   `InfrastructureState`.
2. **GCE COS**: Refactor to use `InfrastructureState.privateIp` for SSH/Docker
   commands.
3. **Local Worktree**: Refactor to ensure parity with the new state model.

## Verification

- `npm run typecheck` passes.
- Existing tests pass (with minor adjustments if needed).
