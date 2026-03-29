# Maneuver: Fix 🔧

The **Fix Mission** is an automated, iterative remediation loop designed to move a Pull Request from a failing state (merge conflicts, CI failures, or unaddressed comments) to a "Ready to Merge" state. It reuses the diagnostic power of the Review Mission to provide high-fidelity orbital correction.

## 🏗️ Architecture: Diagnostic-Remediation Loop

The fix maneuver follows a structured phased execution to safely apply code changes and verify results:

### Phase 0: Parallel Diagnostics
- **Diagnostic Parity**: Reuses the context acquisition, build, and CI monitoring logic from the Review Maneuver.
- **Problem Identification**: Simultaneously identifies merge conflicts, specific CI test failures, and unresolved PR feedback.

### Phase 1: Sequential Remediation
To prevent file-system race conditions, remediation tasks are executed sequentially:
1.  **Conflict Resolution**: Gemini analyzes the conflict state and applies a clean resolution against the base branch.
2.  **CI & Build Repair**: Automatically triages failing logs (lint, typecheck, tests) and applies targeted fixes to the source code.
3.  **Feedback Addressing**: Iteratively addresses outstanding technical comments from reviewers.

### Phase 2: Verification & Synthesis
- **Mustard Test (Proof)**: Physically verifies the fixes in the terminal and provide logs proving the code works.
- **Unified Assessment**: Merges all remediation logs, build results, and behavioral proof into a standardized `final-fix-assessment.md`.
- **User Notification**: Notifies the user of completion via the terminal.

---

## 🛠️ Technical Standards

- **Iterative Repair**: The agent relentlessly pursues a "Green" state for the PR.
- **Empirical Verification**: Mandatory behavioral proof ensures that fixes aren't just syntactically correct, but functionally sound.
- **Consistent Context**: Shares the same Mission Context "Source of Truth" as the Review Maneuver to ensure goal alignment.

## 🚀 Usage

The fix maneuver can be triggered via the standard orbit launch command:

```bash
/orbit mission <PR_NUMBER> fix
```

To monitor progress, use the telemetry commands:
- `/orbit:uplink <PR_NUMBER> fix`: Stream real-time logs from a remote capsule.
- `/orbit:blackbox <PR_NUMBER> fix`: Inspect recorded local mission logs.
