# Skill Consolidation & Mission Control Strategy

This document outlines the assessment of existing skills and playbooks across
the Gemini CLI and Gemini Orbit repositories, and provides a strategy for
consolidation to ensure consistency and high fidelity.

## 1. Current State Assessment

### 📋 Playbook & Skill Inventory

| Component                   | Repository   | Role                    | Assessment                                                           |
| :-------------------------- | :----------- | :---------------------- | :------------------------------------------------------------------- |
| `ci` Skill                  | Orbit & Main | Monitor GH Actions      | **Duplicate.** Scripts are identical. Move to base CLI.              |
| `async-pr-review` Skill     | Orbit & Main | Background PR checks    | **Duplicate.** Minor drift in logging. Move to base CLI.             |
| `review-pr` Skill           | Orbit        | Behavioral PR review    | **Orbit Specific.** Focuses on behavioral proof in remote capsules.  |
| `code-reviewer` Skill       | Main         | Static PR review        | **General Purpose.** Standard static analysis and preflight.         |
| `review-frontend` Cmd       | Main         | Static UI review        | **Targeted.** Specialized prompt for frontend code.                  |
| `fix-pr` Skill              | Orbit        | Iterative PR repair     | **Superior.** Handles conflicts + CI failures + comments in a loop.  |
| `pr-address-comments` Skill | Main         | Address PR feedback     | **Basic.** Only handles existing comments, no CI/conflict loop.      |
| `implement` Playbook        | Orbit        | Issue to Implementation | **Unique.** A powerful "Self-Healing" loop (Repro -> Fix -> Verify). |

## 2. The Problem: "The Verification Gap"

The current fragmented approach leads to several issues:

- **Inconsistent Quality**: `code-reviewer` is too shallow; it doesn't
  "physically prove" changes work.
- **Manual Overhead**: `pr-address-comments` requires too much user guidance for
  simple CI fixes.
- **Maintenance Drift**: Duplicated `ci` and `async-pr-review` skills will
  inevitably diverge.
- **Lack of Flow**: No unified transition from "Fixing CI" to "Addressing Review
  Comments".

## 3. The "Mission Control" Strategy

We will collapse these components into three high-fidelity, environment-aware
skills. These skills will be "Orbit-aware," meaning they automatically enhance
their behavior when running inside a remote capsule.

### 🔭 1. The Unified `review` Skill (The Observer)

- **Merge**: `code-reviewer` + `review-pr` + `/review-frontend`.
- **Behavior**:
  - Performs an initial static analysis (including frontend-specific checks if
    UI is detected).
  - **Physical Proof**: Mandatory requirement to execute the code (e.g., run CLI
    command, call service function) and log output.
  - **Infrastructure Integration**: If in Orbit, automatically pull in parallel
    build/CI logs from the station.
  - **Final Synthesis**: Combine static analysis, CI status, and behavioral
    proof into a single recommendation.

### 🔧 2. The Unified `fix` Skill (The Mechanic)

- **Merge**: `fix-pr` + `pr-address-comments` + `ci`.
- **Behavior**:
  - A relentless, iterative loop that aims for "Green CI".
  - **Phase 1: Sync**: Handle `git merge origin/main` and resolve conflicts.
  - **Phase 2: CI Repair**: Automatically monitor CI, download logs, reproduce
    failures locally, and fix.
  - **Phase 3: Feedback**: Fetch and address GitHub PR comments.
  - **Exit Criteria**: All tests pass, no conflicts, and all comments addressed.

### 🏗️ 3. The Unified `implement` Skill (The Builder)

- **Promote**: Convert the `implement.ts` playbook into a formal skill.
- **Behavior**:
  - **Phase 1: Research**: Analyze the issue and codebase.
  - **Phase 2: Reproduction**: Create a failing Vitest/Integration test that
    proves the issue.
  - **Phase 3: Self-Healing Loop**: Modify code -> Run Repro Test -> Fail ->
    Analyze -> Modify... until the test passes.
  - **Phase 4: Final Verification**: Run full test suite before committing.

## 4. Implementation Roadmap

1.  **Phase 1: Foundation**: Move `ci` and `async-pr-review` to the core Gemini
    CLI (if not already there) and remove from Orbit.
2.  **Phase 2: Promotion**: Migrate the `implement` supervisor logic into a
    reusable Skill.
3.  **Phase 3: Consolidation**: Rebuild the `review` and `fix` skills to
    incorporate the "Behavioral Proof" and "Iterative Repair" mandates.
4.  **Phase 4: Orchestration**: Update `mission.toml` and `orchestrator.ts` to
    leverage these new high-fidelity skills.
