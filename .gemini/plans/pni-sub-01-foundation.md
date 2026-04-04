# Sub-Plan 1: Foundation & Abstraction Layer

This sub-plan establishes the Pulumi foundation and core TypeScript interfaces.

## 1. Dependencies

- Install `@pulumi/pulumi` and `@pulumi/gcp`.
- **Note**: Skipping `@pulumi/aws` for now as per user instruction.

## 2. Configuration Updates

- **File**: `scripts/Constants.ts`
- **Change**: Add `PULUMI_STATE_DIR` pointing to `GLOBAL_ORBIT_DIR/state`.

## 3. Core Interfaces

- **File**: `scripts/infrastructure/InfrastructureState.ts`
  - Define `InfrastructureState` interface:
    - `publicIp`: string
    - `privateIp`: string
    - `instanceId`: string
    - `sshUser`: string
    - `status`: 'provisioning' | 'ready' | 'error' | 'destroyed'
- **File**: `scripts/infrastructure/InfrastructureProvisioner.ts`
  - Define `InfrastructureProvisioner` interface:
    - `up()`: Promise<InfrastructureState>
    - `down()`: Promise<void>
    - `refresh()`: Promise<InfrastructureState>
    - `id`: string

## 4. Verification

- Run `npm run typecheck`.
- Verify `package.json` contains new dependencies.
