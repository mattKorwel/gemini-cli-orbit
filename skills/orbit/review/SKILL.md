---
name: orbit-review
description: Expertise in high-fidelity, parallelized Pull Request reviews using Gemini Workspaces.
---

# Orbit: Mission Observation (Review)

This skill enables the agent to execute a **High-Fidelity PR Review** mission in an isolated Gemini Workspace. This is the gold standard for PR reviews, utilizing parallel execution to provide a comprehensive assessment across multiple dimensions.

## 🚀 The Review Pipeline
The mission follows a strict three-phase execution model:

### Phase 0: Context Acquisition (Parallel)
- **PR Mission Context**: Fetches PR metadata, diff, and recursive issue hierarchy.
- **Diff Fetching**: Obtains the raw changes.
- **Single-Source Build**: Executes `npm ci` and `npm run build` to ensure the environment is ready.

### Phase 1: Evaluation (Parallel)
- **CI Monitor**: Real-time monitoring of branch status.
- **Static Standards**: Checks the diff against repo-specific guidelines (`GEMINI.md`, `.gemini/review-rules.md`).
- **Feedback Analysis**: Analyzes unresolved PR comments and review rejections.
- **Mustard Test (Behavioral Proof)**: **Mandatory.** Physically exercises the new code in the terminal to verify behavior.

### Phase 2: Synthesis
- **Final Assessment**: Merges all logs into a single `final-assessment.md` and provides a definitive "Pass/Fail" recommendation.

## 🛠️ Usage

### 1. Launch a Review
To start a review mission for a specific PR:
```bash
node ${extensionPath}/bundle/orchestrator.js <PR_NUMBER> review
```

### 2. Monitor Progress
Review missions run in a background `tmux` session. You can monitor the logs:
```bash
node ${extensionPath}/bundle/check.js <PR_NUMBER>
```

### 3. Retrieve Results
Once complete, the final assessment is stored on the remote station. The agent can read it using standard file tools if attached, or see the summary in the `check` output.

## ⚠️ Important Guidelines
- **Mustard Test is Key**: Always check the "Behavioral Proof" section. If it's missing or failed, the review is incomplete.
- **Repo Standards**: The review automatically respects `GEMINI.md` and other local configuration files.
- **Parallelism**: Multiple reviews can run simultaneously on different PRs without interference.
