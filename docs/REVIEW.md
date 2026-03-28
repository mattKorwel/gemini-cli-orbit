# Maneuver: Review 🔍

The **Review Mission** is a high-fidelity, parallelized TypeScript mission designed to consolidate PR review logic across all repositories. It ensures consistent quality, reduces manual overhead, and closes "The Mustard Gap" by providing empirical verification of changes.

## 🏗️ Architecture: Parallel Phased Execution

The review follows a strict phased execution to maximize efficiency and depth of analysis:

### Phase 0: Parallel Context & Preparation
- **PR Metadata & Diff**: Simultaneously fetches PR details and the change set.
- **Conflict Detection**: Simulates a merge to identify potential integration issues.
- **Recursive Issue Hierarchy**: Fetches linked issues and sub-issues (up to 3 levels deep).
- **Mission Context Synthesis**: Combines PR description and linked issue data into a unified goal statement.
- **Single-Source Build**: Initiates the build and lint process, sharing logs with subsequent tasks.

### Phase 1: Parallel Evaluation
- **CI Status**: Monitors and waits for branch CI status using `ci.mjs`.
- **Static Rules Enforcement**: Analyzes the diff against local standards (e.g., `.gemini/review-rules.md`).
- **Feedback Analysis**: Summarizes unresolved threads from the PR.
- **"Mustard Test" (Behavioral Proof)**: Physically exercises the code in the terminal to verify functionality. *Note: Only runs if the Phase 0 build succeeds.*

### Phase 2: Final Synthesis
- **Unified Assessment**: Merges all task results, conflict states, and goal alignment into a standardized `final-assessment.md`.
- **User Notification**: Notifies the user of completion via the terminal.

---

## 🛠️ Technical Standards

- **Repo-Agnostic**: Dynamically detects repository context; no hardcoded workspace mappings.
- **Empirical Verification**: Mandatory behavioral proof ensures the code actually works in a live environment.
- **Local Rule Integration**: Automatically respects guidelines from:
    1. `GEMINI.md`
    2. `.gemini/review-rules.md`
    3. `CONTRIBUTING.md`

## 🚀 Usage

The review maneuver can be triggered via the standard orbit launch command:

```bash
/orbit launch --mission review
```
