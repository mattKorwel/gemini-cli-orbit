# Orbit Mission Plans: Consolidated Review

This document details the high-performance, parallelized review mission implemented in Gemini Orbit. This process is designed to bridge "The Mustard Gap" by enforcing mandatory behavioral proof and deep context alignment.

## 🏗️ Architecture: Phased Parallel Execution

The review mission is orchestrated in TypeScript and executed in three distinct phases. All background tasks log to specialized `.md` files in the mission log directory (`.gemini/logs/orbit-review-<PR>/`).

### Phase 0: Context Acquisition (Parallel)
Before evaluation begins, the mission fetches all necessary shared context simultaneously:
1.  **PR Metadata**: Fetches PR body, target branches, and closing issue references.
2.  **Mission Context Synthesis**: Combines the PR description with a recursive fetch (up to 3 levels) of linked GitHub issue hierarchies. Gemini synthesizes these into a single `mission-context.md` "Source of Truth."
3.  **PR Diff**: Fetches the complete diff once and saves it as `pr-diff.diff`.
4.  **Single-Source Build**: Performs a full `npm ci` and `npm run build` once.
5.  **Conflict Check**: Performs a simulated merge using `git merge-tree` to detect outstanding conflicts.

### Phase 1: Parallel Evaluation (Background Tasks)
Once Phase 0 context is ready, N parallel tasks are launched:
- **Task CI (Status)**: Monitors GitHub Actions and triages failures using dynamic repo detection.
- **Task Static (Rules)**: Analyzes the diff against **Repo-Specific Development Guidelines** and the synthesized Mission Context.
- **Task Feedback (Comments)**: Analyzes all unresolved PR comment threads via GraphQL.
- **Task Proof (Mustard)**: **Mandatory**. Physically exercises the code in the terminal using the build logs and diff. 
    - *Note: This task is skipped if the Phase 0 build fails.*

### Phase 2: Final Synthesis (Sequential)
A supervisor merges all findings into a high-fidelity `final-assessment.md`. This report identifies if the code actually works and if it meets the original requirements of the linked issues.

---

## 🛠️ Extensibility & Customization

The mission plan is designed to be extensible at the repository level.

### 1. Repo-Specific Development Guidelines
The Static evaluation task automatically searches for and utilizes **all** existing repository-specific rules found in the following locations:
1.  `GEMINI.md`
2.  `.gemini/review-rules.md`
3.  `CONTRIBUTING.md`

All identified guidelines are explicitly passed to Gemini as the combined standard for the review.

### 2. Custom Verification Logic
Teams can influence the **Behavioral Proof** task by including specific verification steps or examples in their `mission-context.md` or PR description, which the agent will attempt to execute.

---

## 🚀 Triggering the Mission

To start a consolidated review from within an Orbit station or locally:
```bash
orbit mission <PR_NUMBER> review
```

## 📊 Determinism & Reporting
All task states are tracked via deterministic Markdown logs. The user is notified via terminal escape sequences (OSC 9) upon mission completion.
