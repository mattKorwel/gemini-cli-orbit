# Maneuver: Implement 🏗️

The **Implement Mission** is a high-fidelity, autonomous workflow designed to
transform GitHub issues into verified code implementations. It enforces a "Think
Before Code" philosophy through deep context acquisition, structured planning,
and rigorous verification.

## 🏗️ Architecture: Research-Plan-Execute-Verify

The implementation mission follows a strictly phased lifecycle to ensure quality
and architectural alignment:

### Phase 0: Deep Context & Research (Parallel)

Before any code is modified, the mission performs comprehensive research:

1.  **Issue Hierarchy**: Fetches the target issue and its parent, grandparent,
    children, and siblings (up to 3 levels) via GraphQL.
2.  **Context Synthesis**: Combines the issue hierarchy and repository
    guidelines into a unified `mission-context.md`.
3.  **Codebase Analysis**: Performs a targeted analysis of relevant modules and
    dependencies to identify affected files.

### Phase 1: Mission Planning (Read-Only)

Gemini generates a detailed `implementation-plan.md` based on the research. This
plan includes objectives, affected files, small implementation chunks, and a
verification strategy.

### Phase 2: Automated Critic Review

The generated plan is reviewed by an automated "Critic" against requirements and
repository guidelines. If the plan is rejected, it enters a revision loop until
approved (or max attempts reached), ensuring architectural alignment _before_
execution begins.

### Phase 3: Sequential Implementation (Agentic Loop)

The approved plan is implemented in small, manageable chunks (~10-15 minutes
each):

1.  **Test-First**: Each chunk begins by creating or updating a reproduction
    test.
2.  **Implementation**: The agent modifies the source code to satisfy the test.
3.  **Verification**: The test is run immediately to confirm the chunk's
    success.

### Phase 4: Quality Control & Synthesis

- **Final Build**: Ensures the project remains buildable.
- **Project Tests**: Runs the full suite of existing tests to prevent
  regressions.
- **Local Review**: An automated review of the changes against the mission
  context.
- **Mustard Test (Proof)**: Physically verifies the feature in the terminal with
  logs.
- **Final Assessment**: Merges all logs and proof into a
  `final-implementation-assessment.md`.

---

## 🛡️ Technical Standards

- **Security**: Strict policy enforcement ensures no unauthorized tools or
  commands are executed.
- **Transparency**: All task logs and planning documents are session-isolated
  and accessible for review.
- **Empirical Proof**: Implementation is only considered complete when
  behavioral proof is provided.

## 🚀 Usage

The implement maneuver can be triggered via the standard orbit launch command:

```bash
/orbit mission <ISSUE_NUMBER> implement
```

To monitor progress, use the telemetry commands:

- `/orbit:uplink <ISSUE_NUMBER> implement`: Stream real-time logs from a remote
  capsule.
- `/orbit:blackbox <ISSUE_NUMBER> implement`: Inspect recorded local mission
  logs.
