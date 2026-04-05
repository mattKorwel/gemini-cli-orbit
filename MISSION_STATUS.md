# Mission Status: Hierarchical Naming & Decentralized Architecture

## Status

- **Date**: Sunday, April 5, 2026
- **Branch**: `feat/manifest-first-architecture`
- **PR**:
  [mattKorwel/gemini-cli-orbit/pull/36](https://github.com/mattKorwel/gemini-cli-orbit/pull/36)
- **Result**: ✅ Verified E2E locally. All 138 tests passing.

## Completed Work

### 1. Manifest-First Architecture (ADR 0018)

- Replaced fragile positional CLI arguments with a single source of truth: the
  `GCLI_ORBIT_MANIFEST` environment variable.
- Consolidated the 3-step worker handshake (`init` -> `setup-hooks` -> `run`)
  into a single atomic `start` command.

### 2. Decentralized Naming Authority

- Refactored `BaseProvider` into an `abstract` class defining naming hooks:
  - `resolveWorkspaceName(repo, id)`
  - `resolveSessionName(repo, id, action)`
  - `resolveContainerName(repo, id, action)`
  - `resolveWorkDir(workspaceName)`
- **Local Isolation**: Implemented a hierarchical structure for local missions:
  - Root: `orbit-workspaces/` (sibling of main repo).
  - Structure: `orbit-workspaces/<repo-name>/<id-slug>/[action]`.
  - Tmux: `<repo-name>/<id-slug>/[action]`.
- **Remote Preservation**: Maintained the flat legacy structure for GCE missions
  to avoid regressions.
- **Data Integrity**: Refactored `resolveMissionContext` to be a pure metadata
  extractor with **zero pruning** of repository names or user identifiers.

### 3. Gemini "STANDBY MODE"

- Refined Gemini chat prompts to be completely passive.
- Gemini now initializes in `STANDBY MODE`, waiting for user instructions rather
  than initiating autonomous research.

### 4. Robust Cleanup

- Enhanced the `jettison` command to accept an optional action.
- If no action is specified, `jettison` now robustly attempts to clean up all
  possible mission variants (`chat`, `fix`, `review`, etc.) for a given ID.

## Next Steps

- Merge [PR #36](https://github.com/mattKorwel/gemini-cli-orbit/pull/36) after
  final review.
- Proceed with implementing additional backend providers using the new abstract
  hooks.
