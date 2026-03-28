# Orbit Mission Plans: Consolidated Maneuvers

This document details the high-performance, phased missions implemented in Gemini Orbit. These maneuvers are designed to bridge "The Mustard Gap" by enforcing mandatory behavioral proof and deep context alignment.

---

## 🏗️ Maneuver: Consolidated Review

The **Review Mission** provides a high-fidelity, parallelized PR review that ensures consistent quality and reduces manual overhead.

### Architecture: Phased Parallel Execution
The review mission is orchestrated in TypeScript and executed in three distinct phases. All background tasks log to specialized `.md` files in the mission log directory (`.gemini/logs/orbit-review-<PR>/`).

#### Phase 0: Context Acquisition (Parallel)
Before evaluation begins, the mission fetches all necessary shared context simultaneously:
1.  **PR Metadata**: Fetches PR body, target branches, and closing issue references.
2.  **Mission Context Synthesis**: Combines the PR description with a recursive fetch (up to 3 levels) of linked GitHub issue hierarchies.
3.  **PR Diff**: Fetches the complete diff once and saves it as `pr-diff.diff`.
4.  **Single-Source Build**: Performs a full `npm ci` and `npm run build`.
5.  **Conflict Check**: Performs a merge-conflict check against the base branch.

#### Phase 1: Parallel Evaluation
Once Phase 0 context is ready, N parallel tasks are launched:
- **Task CI (Status)**: Monitors GitHub Actions and triages failures using dynamic repo detection.
- **Task Static (Rules)**: Analyzes the diff against Repo-Specific Development Guidelines and the synthesized Mission Context.
- **Task Feedback (Comments)**: Analyzes all unresolved PR comment threads via GraphQL.
- **Task Proof (Mustard)**: **Mandatory**. Physically exercises the code in the terminal using the build logs and diff.

#### Phase 2: Final Synthesis (Sequential)
A supervisor merges all findings into a high-fidelity `final-assessment.md`.

---

## 🛠️ Maneuver: Consolidated Fix

The **Fix Mission** provides an automated, iterative remediation loop that moves a Pull Request to a "Ready to Merge" state.

### Architecture: Diagnostic-Remediation Loop
The fix mission leverages the diagnostic infrastructure of the review maneuver but introduces a sequential remediation phase to safely apply code changes.

#### Phase 0: Diagnostic Context (Parallel)
Reuses the context acquisition from the Review maneuver to identify:
- Merge conflicts with the base branch.
- CI/Build failures and specific test errors.
- Outstanding reviewer comments and feedback threads.

#### Phase 1: Sequential Remediation
Remediation tasks are executed sequentially to prevent file-system race conditions:
1.  **Sync & Conflict resolution**: Gemini resolves any merge conflicts with the base branch.
2.  **CI & Build Repair**: Automatically analyzes failures and fixes tests, type errors, and lint issues.
3.  **Feedback Addressing**: Implements code changes based on outstanding reviewer comments.

#### Phase 2: Verification & Synthesis
- **Final Verification Build**: Ensures the repository remains in a buildable state.
- **Mustard Test (Proof)**: Physically verifies the fixes in the terminal and provide logs.
- **Synthesis**: Merges all remediation logs and proof into a standardized `final-fix-assessment.md`.

---

## 🚀 Triggering Maneuvers

Missions can be triggered from within an Orbit station or locally:

```bash
# Start a consolidated review
orbit mission <PR_NUMBER> review

# Start a consolidated fix mission
orbit mission <PR_NUMBER> fix
```

## 📊 Determinism & Reporting
All task states are tracked via deterministic Markdown logs in `.gemini/logs/orbit-<action>-<PR>/`. The user is notified via terminal escape sequences (OSC 9) upon mission completion.
