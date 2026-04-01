# Master Plan: Pulumi-Native Infrastructure (PNI) Migration

This master plan tracks the progress of decoupling infrastructure provisioning from operational management by introducing a TypeScript-native IaC layer using **Pulumi**.

## Status
- [x] **Sub-Plan 1: Foundation & Abstraction Layer** ([pni-sub-01-foundation.md](pni-sub-01-foundation.md))
- [ ] **Sub-Plan 2: Target-Aware Provisioners** ([pni-sub-02-targets.md](pni-sub-02-targets.md))
- [ ] **Sub-Plan 3: Execution Provider Refactoring** ([pni-sub-03-execution.md](pni-sub-03-execution.md))
- [ ] **Sub-Plan 4: CLI Lifecycle Integration** ([pni-sub-04-cli.md](pni-sub-04-cli.md))
- [ ] **Sub-Plan 5: Verification & Cleanup** ([pni-sub-05-cleanup.md](pni-sub-05-cleanup.md))

## Objective
1.  **Remove `gcloud` dependency** for infrastructure provisioning.
2.  **Implement Multi-cloud support** via Pulumi's provider ecosystem.
3.  **Ensure Declarative State** for all cloud resources.

## Reference
- **ADR 0016**: [0016-pni-pulumi.md](../adr/0016-pni-pulumi.md)
- **Original Plan**: [pni-migration-plan.md](pni-migration-plan.md)
