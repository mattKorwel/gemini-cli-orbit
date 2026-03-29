# Plan: PR Review Consolidation

Consolidate fragmented PR review skills and commands into a single,
high-fidelity, environment-aware `review` skill that meets the "Mustard Test"
(Behavioral Proof + Strict Rules).

## Objective

- Merge `code-reviewer` (Main), `review-pr` (Orbit), and `/review-frontend`
  (Main) into a unified `review` skill.
- Ensure the skill is "Orbit-aware" to leverage remote infrastructure logs.
- Enforce mandatory "Behavioral Proof" (executing code to verify changes).
- Maintain strict adherence to `strict-development-rules.md`.

## Key Files & Context

- **Orbit Repo**:
  - `skills/review-pr/SKILL.md`: Source for behavioral proof requirements.
  - `scripts/playbooks/review.ts`: Current Orbit review playbook.
- **Main Repo**:
  - `.gemini/skills/code-reviewer/SKILL.md`: Base review workflow.
  - `.gemini/commands/review-frontend.toml`: Frontend/UI specific rules.
  - `.gemini/commands/strict-development-rules.md`: Foundational project rules.

## Implementation Steps

### 1. Skill Promotion & Architecture

- Create a new, unified `SKILL.md` in `skills/review/SKILL.md` (in Orbit for
  now, intended for eventual migration to Main).
- This skill will use a "Verification-First" approach.

### 2. Drafting the Unified `review` Skill

The new skill will follow this phased workflow:

1.  **Phase 1: Context & Infrastructure**:
    - Detect environment (Orbit vs. Local).
    - If Orbit: Read
      `/mnt/disks/data/gemini-cli-config/.gemini/logs/orbit-<PR>/build.log` and
      `ci-status.exit`.
    - If Local: Perform `gh pr checkout` and suggest `npm run preflight`.
2.  **Phase 2: Static Analysis (The "Rules")**:
    - Apply `strict-development-rules.md`.
    - If React/Ink changes are detected, apply `review-frontend` logic
      (conventional commits, consistency).
3.  **Phase 3: Behavioral Verification (The "Mustard")**:
    - **Requirement**: Agent must physically prove the feature works.
    - **Action**: Write a `.ts` script, run a CLI command, or exercise a
      service.
    - **Log**: Output must be included in the review synthesis.
4.  **Phase 4: Synthesis & Recommendation**:
    - Combine Static + Infrastructure + Behavioral results.
    - Recommendation: `APPROVE`, `COMMENT`, or `REJECT`.

### 3. Updating Orchestration

- Modify `scripts/playbooks/review.ts` to simply activate the new `review` skill
  instead of running a separate TaskRunner.
- Update `commands/orbit/mission.toml` to ensure the `review` action points to
  the new logic.

### 4. Cleanup

- Remove the redundant `skills/review-pr` and `skills/code-reviewer` (from
  Orbit).

## Verification & Testing

1.  **Dry Run**: Trigger `orbit mission <PR> review` and verify the agent:
    - Checks Orbit logs.
    - Mentions `strict-development-rules.md`.
    - Attempts a behavioral proof (running code).
2.  **Unit Tests**: Update `scripts/playbooks/playbooks.test.ts` if necessary to
    reflect the change in how the review is triggered.
