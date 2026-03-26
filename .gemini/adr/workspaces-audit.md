# Plan: Detailed Review of Gemini Orbits Extension

## Objective
Perform a deep-dive review of the `gemini-orbits-extension` focusing on **Accuracy, Isolation, Speed, Security, and Code Quality**.

## Key Files to Review
- `scripts/orchestrator.ts`: Local orchestration and auth injection.
- `scripts/setup.ts`: Environment initialization and repo management.
- `scripts/clean.ts`: Cleanup and state management.
- `scripts/entrypoint.ts`: Remote execution and TUI launching.
- `scripts/providers/GceCosProvider.ts`: Infrastructure and container lifecycle.
- `policies/orbit-policy.toml`: Security boundaries.

## Phased Review Tasks

### Phase 1: Security Audit
- [ ] Audit token retrieval in `setup.ts` and `orchestrator.ts`.
- [ ] Verify `gh auth login` doesn't leak secrets in command history or logs.
- [ ] Review `orbit-policy.toml` for overly broad permissions (e.g., `git` vs specific `git` subcommands).

### Phase 2: Isolation & Accuracy
- [ ] Test path consistency for `.git` worktree metadata.
- [ ] Verify that clearing history truly prevents session leakage.
- [ ] Ensure that `node` user isolation inside the container is maintained after `chown` fixes.

### Phase 3: Performance & Reliability
- [ ] Profile container startup and git fetch vs clone times.
- [ ] Validate `tmux` persistence on failure (no more disappearing tabs).
- [ ] Review `setup.ts` logic for avoiding redundant clones.

### Phase 4: Code Quality
- [ ] Refactor duplicate path/logic blocks in `orchestrator.ts`.
- [ ] Improve TypeScript typing across provider and orchestrator.
- [ ] Standardize logging and CLI feedback.

## Verification
- Run a full `setup` -> `open` -> `clean` loop and verify zero leftover state.
- Manually check `gh auth status` and file permissions inside the container.
