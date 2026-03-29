---
name: orbit-fix
description:
  Expertise in automated, multi-phase Pull Request repair and conflict
  resolution using Gemini Workspaces.
---

# Orbit: Orbital Correction (Fix)

This skill enables the agent to execute an **Automated PR Fix** mission in an
isolated Gemini Workspace. It is designed to autonomously repair CI failures,
resolve merge conflicts, and address PR feedback through a structured,
multi-phase process.

## 🚀 The Fix Pipeline

The mission follows a strict sequence of diagnostics, remediation, and
verification:

### Phase 0: Diagnostics (Parallel)

- **Mission Context**: Fetches PR metadata and recursive issue hierarchy.
- **CI Monitor**: Identifies specific failing jobs and logs.
- **Feedback Analysis**: Collects unresolved PR comments and review rejections.
- **Baseline Build**: Executes a full build to establish a baseline.

### Phase 1: Remediation (Sequential)

- **Sync & Conflict Resolution**: Merges with the base branch and resolves
  conflicts.
- **CI & Build Repair**: Targets the specific failures identified in Phase 0.
- **Address PR Feedback**: Iteratively applies changes requested by reviewers.

### Phase 2: Verification (Parallel)

- **Final Build Verification**: Ensures the codebase remains buildable after all
  fixes.
- **Mustard Test (Behavioral Proof)**: **Mandatory.** Physically exercises the
  updated code in the terminal to verify the fix works as expected.

### Phase 3: Synthesis

- **Final Fix Assessment**: Generates a detailed report
  (`final-fix-assessment.md`) summarizing what was fixed and providing evidence
  of success.

## 🛠️ Usage

### 1. Launch a Fix Mission

To start a fix mission for a specific PR:

```bash
node ${extensionPath}/bundle/orchestrator.js <PR_NUMBER> fix
```

### 2. Monitor Progress

Fix missions run in a background `tmux` session. You can monitor the logs:

```bash
node ${extensionPath}/bundle/check.js <PR_NUMBER>
```

### 3. Retrieve Results

Once complete, the final assessment and modified code are available on the
remote station. The agent can then push the changes to origin if the user
approves.

## ⚠️ Important Guidelines

- **Autonomous Repair**: The fix mission is designed to be autonomous. Trust the
  multi-phase diagnostics to identify the root cause.
- **Mustard Test is Mandatory**: Always verify that the behavioral proof was
  successful.
- **Sequential Logic**: Unlike reviews, remediation in Phase 1 is sequential to
  avoid race conditions during code modification.
