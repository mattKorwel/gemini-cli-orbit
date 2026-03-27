# Plan G: Reference-Based Session Isolation

## Objective
Implement process-level security isolation using job-specific containers and **Git Reference Clones**. This allows us to keep the main repository mount **Read-Only** inside the container.

## 1. Core Changes

### Infrastructure (`GceCosProvider.ts`)
- Update `runContainer` to support multiple mounts with varying `readonly` flags.
- Ensure the `main` repo is mounted as `readonly: true`.

### Orchestration (`orchestrator.ts` & `RemoteProvisioner.ts`)
- Replace `git worktree add` with `git clone --reference`.
- Logic flow:
  1. **Host**: Run `git fetch` on the main repo to update objects.
  2. **Orchestrator**: Start job-specific container with RO main repo and RW worktree path.
  3. **Container**: Run `git clone --reference /mnt/disks/data/main https://github.com/google-gemini/gemini-cli.git /mnt/disks/data/worktrees/orbit-A`.
  4. **Container**: Run `gh pr checkout` or `git checkout FETCH_HEAD`.

### Monitoring (`status.ts`)
- Continue with multi-container scanning logic already implemented.

## 2. Testing Strategy

1. **Unit Test**: Update `RemoteProvisioner.test.ts` to expect `git clone --reference` instead of `worktree add`.
2. **Integration**: Verify that `git log` inside the job container works correctly.
3. **Security**: Confirm that `rm -rf /mnt/disks/data/main` fails inside the job container.

## 3. Implementation Steps

1. [ ] Refactor `GceCosProvider` to support RO/RW mount toggles.
2. [ ] Refactor `RemoteProvisioner` to implement the reference clone logic.
3. [ ] Update `orchestrator` to ensure host-side objects are fetched before container start.
