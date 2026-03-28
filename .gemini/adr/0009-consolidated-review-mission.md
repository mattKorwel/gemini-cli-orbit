# ADR 9: Consolidated Review Mission

## Status
Proposed

## Context
The current PR review process is fragmented across multiple repositories (`gemini-cli` and `orbit`), skills (`code-reviewer`, `review-pr`, `async-pr-review`), and slash commands (`/review-frontend`). This leads to inconsistent quality, manual overhead, and "The Mustard Gap" (failure to physically prove changes work). Furthermore, existing scripts in `main` are often repo-specific and not available in the npm package.

## Decision
We will consolidate all PR review logic into a single, high-fidelity, repo-agnostic "Review Mission" orchestrated in TypeScript within the Gemini Orbit extension.

### Core Architecture: Parallel Phased Execution
1.  **Phase 0: Parallel Context & Preparation (Background)**
    - Simultaneously fetch PR metadata, diff, and simulate a merge to detect conflicts.
    - Recursive fetch of linked issues and sub-issue hierarchy (up to 3 levels).
    - Combine PR description and linked issue data into a unified **Mission Context** via Gemini synthesis.
    - Initiate the Build/Lint once and share the `build.log`.
2.  **Phase 1: Parallel Evaluation (Background Tasks)**
    - **Task A (CI Status)**: Monitor/Wait for CI using Generalized `ci.mjs`.
    - **Task B (Static Rules)**: Analyze diff against rules and unified mission context.
    - **Task C (Feedback Analysis)**: Summarize unresolved threads using Generalized `fetch-pr-info.js`.
    - **Task D (Behavioral Proof)**: Physically exercise the code in the terminal. **Dependency**: ONLY runs if Phase 0 Build succeeds.
3.  **Phase 2: Final Synthesis (Sequential)**
    - Merge all task results, conflict state, and goal alignment into a standardized `final-assessment.md`.
    - Notify the user via `notifyViaTerminal`.

### Technical Standards
- **TypeScript Orchestration**: Replace Bash scripts with a parallelized TypeScript `TaskRunner`.
- **Repo-Agnosticism**: Dynamically detect repository name and owner; remove hardcoded workspace mappings.
- **Markdown-Based State**: Use `.md` files for deterministic task state and easy synthesis.
- **Extensibility**: Support repository-level rules (e.g., `.gemini/review-rules.md`) with a standard fallback.

## Rationale
- **Efficiency**: Fetch once, build once, run everything in parallel.
- **Consistency**: One unified entry point for all review activities.
- **High Fidelity**: Enforces mandatory behavioral proof and checks for goal alignment with linked issues.
- **Portability**: Makes the "Best of Gemini CLI" logic available to all users on any repository.

## Consequences
- Requires porting and generalizing `ci.mjs` and `fetch-pr-info.js` to the Orbit repo.
- Redundant skills (`review-pr`, `async-pr-review` in Orbit) will be removed.
- Initial setup for Task I requires recursive GraphQL calls and Gemini synthesis.
