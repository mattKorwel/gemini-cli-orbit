# ADR 10: Consolidated Fix Mission

## Status

Proposed

## Context

Following the success of the Consolidated Review Mission (ADR 9), the Pull
Request remediation process remains fragmented. The current `fix` playbook in
Orbit is a simple placeholder that delegates to a single Gemini prompt, lacking
structure, diagnostic depth, and visibility. There is no unified mechanism to
resolve merge conflicts, fix CI failures, and address PR comments in a single,
high-fidelity, and verifiable loop.

## Decision

We will implement a unified, phased "Fix Mission" orchestrated in TypeScript
within the Gemini Orbit extension, reusing the diagnostic infrastructure from
the Review Mission.

### Core Architecture: Diagnostic-Remediation Loop

1.  **Phase 0: Parallel Diagnostics (Reuse ADR 9 logic)**
    - Simultaneously fetch PR metadata, mission context, diff, and issue
      hierarchy.
    - Perform a baseline build and monitor branch CI status using `ci.mjs`.
    - Fetch and summarize unresolved PR feedback using `fetch-pr-info.js`.
    - Perform a merge-conflict check against the base branch.
2.  **Phase 1: Sequential Remediation (Agentic)**
    - Unlike the review mission, remediation tasks are executed **sequentially**
      to avoid file-system race conditions.
    - **Task: Sync**: Resolve merge conflicts with the base branch.
    - **Task: CI Repair**: Iteratively fix tests, type errors, and lint issues
      identified in Phase 0.
    - **Task: Feedback**: Address outstanding PR comments and reviewer feedback.
3.  **Phase 2: Verification (Parallel)**
    - Perform a final verification build.
    - **Task: Behavioral Proof (Proof)**: Physically verify the fixes in the
      terminal and provide logs.
4.  **Phase 3: Final Synthesis (Sequential)**
    - Merge all remediation logs, build results, and proof into a standardized
      `final-fix-assessment.md`.
    - Notify the user via terminal escape sequences.

### Technical Standards

- **TaskRunner Integration**: Utilize the `TaskRunner` for visibility into the
  remediation progress.
- **Diagnostic Parity**: Use the same context acquisition tools as the Review
  Mission to ensure consistency between observation and correction.
- **Incremental Commits**: Encourage (via prompt) small, focused commits for
  different categories of fixes.

## Rationale

- **Efficiency**: Reuse existing diagnostic tools and logs; don't make Gemini
  "re-discover" known failures.
- **Visibility**: Provide the developer with a clear UI showing exactly which
  remediation step is being attempted.
- **High Fidelity**: Enforces the same "Behavioral Proof" mandate for fixes that
  we require for reviews.

## Consequences

- Requires careful prompt engineering to ensure Gemini doesn't accidentally
  revert its own fixes during sequential tasks.
- The `fix-pr` and `pr-address-comments` skills will be superseded by this
  unified orbital maneuver.
