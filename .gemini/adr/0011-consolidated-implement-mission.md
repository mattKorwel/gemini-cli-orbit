# ADR 11: Consolidated Implement Mission

## Status

Proposed

## Context

The current `implement` playbook in Orbit is a basic supervisor loop that lack
deep context acquisition, structural planning, and rigorous verification. It
operates primarily on a single issue without considering the broader issue
hierarchy (parents, grandparents, siblings) or project-specific coding
guidelines. Furthermore, it lacks a formal "Read-Only Planning" phase before
execution.

## Decision

We will implement a high-fidelity, phased "Implement Mission" orchestrated in
TypeScript within the Gemini Orbit extension, following the architectural
patterns of the Review (ADR 9) and Fix (ADR 10) missions.

### Core Architecture: Research-Plan-Execute-Verify Loop

1.  **Phase 0: Deep Context & Research (Parallel)**
    - **Task A (Issue Hierarchy)**: Fetch the complete issue hierarchy including
      parents, grandparents, children, and siblings (up to 3 levels) via
      GraphQL.
    - **Task B (Guidelines)**: Collect repo-specific development guidelines from
      `GEMINI.md`, `.gemini/review-rules.md`, and `CONTRIBUTING.md`.
    - **Task C (Codebase Analysis)**: Perform a targeted search/read of relevant
      modules identified from the issue description.
    - **Task D (Synthesis)**: Merge all research into a `mission-context.md`
      that defines the "What".

2.  **Phase 1: Mission Planning (Read-Only)**
    - Gemini generates a detailed `implementation-plan.md` based on the Mission
      Context.
    - **Mandatory Review**: The plan is reviewed (either by the user or an
      LLM-based "Critic" task) against the requirements and guidelines.
    - Revisions are applied until the plan is approved.

3.  **Phase 2: Sequential Implementation (Agentic)**
    - Executed in small, iterative chunks (~10-15 minutes each).
    - **Test-First Approach**: For each chunk, a failing test is created/updated
      first.
    - **Self-Healing Loop**: Implementation -> Test Run -> Failure Analysis ->
      Fix -> Verification.
    - Encourages small, focused commits for each successful chunk.

4.  **Phase 3: Final Verification & Quality Control (Parallel)**
    - **Task A (Build & Test)**: Run the full project test suite and build.
    - **Task B (Local Review)**: Perform an automated local code review of the
      changes against the Mission Context and guidelines.
    - **Task C (Behavioral Proof)**: Physically exercise the new feature in the
      terminal and provide logs.

5.  **Phase 4: Synthesis & Submission**
    - Merge all logs and verification results into a
      `final-implementation-assessment.md`.
    - Automatically create a Pull Request with the implementation details and
      verification logs.

### Technical Standards

- **TaskRunner Integration**: Full visibility into research and verification
  phases.
- **Read-Only Planning**: Explicit separation between "Thinking" and "Coding"
  phases.
- **Hierarchical Context**: Use GraphQL to navigate the full GitHub issue graph.
- **Small-Step Enforcement**: Prompt engineering to favor incremental changes
  and early testing.

## Rationale

- **Quality**: Test-first and small-step approach reduces regression risk.
- **Alignment**: Planning phase ensures the "How" matches the "What" before code
  is touched.
- **Completeness**: PR creation with verification logs provides a high-fidelity
  hand-off.

## Consequences

- Requires a more complex context acquisition tool
  (`fetch-implement-context.ts`).
- Adds a mandatory "Wait for Approval" step in the workflow (or an automated
  critic fallback).
- Supersedes the existing `implement.ts` playbook.
