# Mission: GCE Capsule-First Refactor 🚀

## Current State
- **Architecture**: Persistent GCE VM (`gcli-orbit-<user>`) with Fast-Path SSH.
- **Logic**: Decoupled scripts in `~/.orbit/scripts`, using Git Worktrees for concurrency.
- **Auth**: Scoped GitHub PATs mirrored via setup.

## The Goal (Capsule-OS Transition)
Shift from a "Manual VM" to an "Invisible VM" (Capsule-Optimized OS) that runs our Sandbox Docker image directly.

## Planned Changes
1. **Multi-Stage Dockerfile**: ✅ VERIFIED
   - Optimize `.gcp/Dockerfile.development` to include `tsx`, `vitest`, `gh`, and system dependencies (`libsecret`, `build-essential`).
   - *Verified locally: Node v20, GH CLI, Git, TSX, and Vitest are functional with required headers.*
2. **Dedicated Pipeline**:
   - Use `.gcp/development-station.yml` for isolated builds.
   - **Tagging Strategy**: 
     - `latest`: Automatically updated on every merge to `main`.
     - `branch-name`: Created on-demand for PRs via `/gcbrun` comment.
3. **Setup Script (`setup.ts`)**:
   - Refactor `provision` to use `gcloud compute instances create-with-capsule`.
   - Point to the new `development` image in Artifact Registry.
4. **Orchestrator (`orchestrator.ts`)**:
   - Update SSH logic to include the `--capsule` flag.

## GCP Console Setup (Two Triggers)

### Trigger 1: Production Development Image (Automatic)
1. **Event**: Push to branch.
2. **Branch**: `^main$`.
3. **Configuration**: Point to `.gcp/development-station.yml`.
4. **Purpose**: Keeps the stable "Golden Image" up to date for daily use.

### Trigger 2: On-Demand Testing (Comment-Gated)
1. **Event**: Pull request.
2. **Base Branch**: `^main$`.
3. **Comment Control**: Set to **"Required"** (e.g. `/gcbrun`).
4. **Configuration**: Point to `.gcp/development-station.yml`.
5. **Purpose**: Allows developers to test infrastructure changes before merging.

## Phase 2: Refactoring setup.ts for Capsule-OS
This phase is currently **ARCHIVED** in favor of the Persistent Workstation model. 

### Implementation Logic (Snapshot)
The orchestrator should launch isolated capsules using this pattern:
```bash
docker run --rm -it \
  --name orbit-job-id \
  -v ~/dev/worktrees/job-id:/home/node/dev/worktree:rw \
  -v ~/dev/main:/home/node/dev/main:ro \
  -v ~/.gemini:/home/node/.gemini:ro \
  -w /home/node/dev/worktree \
  development-image:latest \
  sh -c "tsx ~/.orbit/scripts/entrypoint.ts ..."
```

## How to Resume
1. Review the archived capsule-launch logic above.
2. Update `setup.ts` to use `gcloud compute instances create-with-capsule`.
3. Update `orchestrator.ts` to use `docker run` instead of standard `ssh`.
