# Plan: Fix Remote Auth and Cleanup Errors

## Objective
Resolve the "gh command not found" error on the host and the "rm is a directory" error during history cleanup.

## Changes

### 1. scripts/setup.ts
- Remove the `gh auth login` command that runs on the host OS (COS). 
- Rely entirely on the containerized `gh` login handled in the orchestrator.

### 2. scripts/RemoteProvisioner.ts
- Update `clearHistoryCmd` to use `rm -rf` instead of `rm -f` to handle cases where a session ID might match a directory.

### 3. scripts/clean.ts
- Update history removal logic to use `rm -rf` for both surgical and bulk cleanup.

## Verification
- Run `npx tsx scripts/setup.ts --yes` and verify no `gh: command not found` error.
- Run `npx tsx scripts/orchestrator.ts 23176 --open foreground` and verify the interactive session starts without `rm` errors.
