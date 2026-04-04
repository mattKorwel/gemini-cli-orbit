# Implementation Plan: Restructure to src/ Architecture

This plan outlines the migration from a `scripts/` based layout to a formal
`src/` architecture to improve project organization and maintainability.

## Objective

1.  **Standardize Project Layout**: Move all source code to a dedicated `src/`
    directory.
2.  **Organize by Responsibility**: Categorize files into core, cli, providers,
    playbooks, and utils.
3.  **Update Tooling**: Ensure build, test, and linting tools are aligned with
    the new structure.

---

## Phase 1: Directory Preparation

- Create the target directory structure:
  - `src/core/`
  - `src/cli/`
  - `src/providers/`
  - `src/playbooks/`
  - `src/utils/`
  - `src/infrastructure/`

## Phase 2: File Migration

- **CLI Layer**:
  - `scripts/orbit-cli.ts` -> `src/cli/orbit-cli.ts`
  - `scripts/bin/*` -> `src/cli/bin/*`
  - `scripts/entrypoint.ts` -> `src/cli/entrypoint.ts`
- **Core Logic**:
  - `scripts/*.ts` (remaining files) -> `src/core/`
- **Subdirectories**:
  - `scripts/providers/*` -> `src/providers/*`
  - `scripts/playbooks/*` -> `src/playbooks/*`
  - `scripts/utils/*` -> `src/utils/*`
- **Scripts**:
  - `scripts/provision-worker.sh` -> `src/core/provision-worker.sh` (or
    `src/utils/`)

## Phase 3: Configuration & Path Updates

- **tsconfig.json**: Update `rootDir` to `"./src"`.
- **vitest.config.ts**: Update `include` to `["src/**/*.test.ts"]`.
- **package.json**: Update scripts:
  - `sync-docs`: `tsx tools/sync-docs.ts` (Check if this tool needs update)
  - `version:release`: `tsx tools/prepare-release.ts`
- **tools/bundle.sh**: Update paths to search in `src/` instead of `scripts/`.
- **src/core/Constants.ts**: Adjust `EXTENSION_ROOT` resolution logic if
  necessary.

## Phase 4: Import & Path Refactoring

- Perform global search and replace of `scripts/` with `src/`.
- Fix any broken imports resulting from the organization change (e.g., if a file
  moved deeper).

## Phase 5: Verification

- **Build**: `npm run build`
- **Test**: `npm test`
- **Typecheck**: `npm run typecheck`
- **Lint**: `npm run lint`
