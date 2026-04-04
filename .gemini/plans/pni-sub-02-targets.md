# Sub-Plan 2: Target-Aware Provisioners

Implement the first set of remote provisioners in `src/infrastructure/targets/`.

## Objective

- [ ] Implement `LocalNoopTarget.ts`.
- [ ] Implement `GcpCosTarget.ts`.
- [ ] Create `InfrastructureFactory.ts` to manage provisioner instances.

## Tasks

1. **Directory**: Create `src/infrastructure/targets/`.
2. **Local Target**: Implement `LocalNoopTarget.ts` which just returns a static
   `ready` state.
3. **GCP COS Target**: Implement `GcpCosTarget.ts` using Pulumi Automation API
   to manage a GCE instance with COS image.
4. **Factory**: Create `src/infrastructure/InfrastructureFactory.ts`.

## Verification

- `npm run typecheck` passes.
- Unit tests for `LocalNoopTarget`.
