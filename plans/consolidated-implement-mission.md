# Implementation Plan: Consolidated Implement Mission

This plan details the steps to implement the "Consolidated Implement Mission" as
described in ADR 11.

## Objective

Create a high-fidelity, phased "Implement Mission" orchestrated in TypeScript
within the Gemini Orbit extension.

## Key Files & Context

- `scripts/playbooks/implement.ts`: The main playbook (to be refactored).
- `scripts/utils/fetch-implement-context.ts`: New utility for deep issue
  hierarchy context.
- `scripts/TaskRunner.ts`: The orchestration engine.
- `scripts/station.ts`: The remote entry point.

## Implementation Steps

### 1. Research & Context Utility

Create `scripts/utils/fetch-implement-context.ts`:

- Use GraphQL to fetch issue details.
- Recursively fetch Parents, Grandparents, Children, and Siblings (up to 3
  levels).
- Fetch Repository Guidelines (`GEMINI.md`, etc.).
- Synthesize "The What" into `mission-context.md`.

### 2. Implementation Playbook Refactor

Update `scripts/playbooks/implement.ts`:

- **Phase 0 (Research)**: Run `fetch-implement-context.ts` and codebase
  analysis.
- **Phase 1 (Planning)**: Gemini generates `implementation-plan.md` (Read-only).
- **Phase 2 (Review)**: Automated "Critic" review of the plan against
  guidelines.
- **Phase 3 (Execution)**: Sequential, iterative chunks (~10-15 mins).
  - Test-First: Create repro test.
  - Fix: Modify code.
  - Verify: Run tests.
- **Phase 4 (Final Quality Control)**:
  - Local Review: Automated check against mission context.
  - Mustard Test: Behavioral proof in terminal.
  - Synthesis: Generate `final-implementation-assessment.md`.

### 3. Orchestration & Wiring

- Update `scripts/station.ts` to ensure it passes all necessary parameters to
  `runImplementPlaybook`.
- Ensure `scripts/entrypoint.ts` correctly handles the interactive transition
  after the mission completes.

### 4. PR Creation Utility

- Create/Update a utility to handle PR creation after a successful
  implementation mission.

## Verification & Testing

- **Unit Tests**: Add tests for `fetch-implement-context.ts` hierarchy logic.
- **Integration Test**: Run a mock implementation mission on a sample issue.
- **Manual Verification**: Launch `/orbit mission <ISSUE> implement` and verify
  the phased execution and generated documents.
