# Plan: Remote Skill & Extension Synchronization

## Objective
Ensure the remote `development` worker has the full extension and its ported skills installed and linked for use by the automated supervisor loops.

## 1. Directory Structure Prep
- Define `EXTENSION_REMOTE_PATH` as `${WORKSPACES_ROOT}/extension` in `Constants.ts`.

## 2. Update `setup.ts`
- **Full Extension Sync**: Sync the entire local extension directory (including `skills/` and `gemini-extension.json`) to the remote worker at `EXTENSION_REMOTE_PATH`.
- **Remote Linking**: 
    - After syncing, execute `gemini extensions link .` inside the `development-worker` container (pointing to the synced directory).
    - This ensures that when the supervisor runs `gemini`, it has access to `/workspace:review`, `ci`, etc.

## 3. Orchestrator Update
- Ensure the `docker exec` wrapper correctly preserves the linked extensions for the `node` user.

## 4. Verification
- Run `/workspace:setup`.
- Exec into the remote container and run `gemini extensions list` to verify "workspaces" is linked.
