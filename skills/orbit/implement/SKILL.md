---
name: orbit-implement
description:
  Expertise in high-fidelity, autonomous feature implementation using Gemini
  Orbit.
---

# Orbit: Mission Execution (Implement)

This skill enables the agent to execute an **Autonomous Implementation Mission**
in an isolated **Orbit Capsule**. This is for implementing complex features or
addressing large issues through a multi-phase, self-correcting process.

## 🚀 The Implementation Pipeline

The mission follows a strict sequence of research, planning, execution, and
verification:

### Phase 0: Research & Context (Parallel)

- **Deep Context Acquisition**: Fetches issue metadata and recursive dependency
  maps.
- **Codebase Analysis**: Analyzes relevant files and dependencies to identify
  key touchpoints.

### Phase 1: Planning (Read-Only)

- **Implementation Plan**: Generates a detailed plan with clear objectives,
  affected files, small steps, and a test-first verification plan.

### Phase 2: Automated Critic Review (Self-Correction)

- **Critic Loop**: A second, independent agent reviews the plan against
  requirements. If problems are found, it provides feedback for the primary
  agent to revise the plan. This continues until "GO" is achieved.

### Phase 3: Sequential Implementation (Agentic Loop)

- **Small Chunks**: Work is divided into small, 10-minute chunks.
- **Test-First Development**: A reproduction or verification test is written
  _before_ the code for each chunk.
- **Mandatory Verification**: Every chunk must pass its tests before moving to
  the next.

### Phase 4: Quality Control (Parallel)

- **Final Build**: Ensures the overall codebase remains buildable.
- **Local Review**: An independent review of the final implementation.
- **Mustard Test (Behavioral Proof)**: **Mandatory.** Physically exercises the
  new implementation in the terminal to verify it works as expected.

### Phase 5: Synthesis & PR Preparation

- **Mission Synthesis**: Generates a comprehensive final report and prepares the
  PR description.

## 🛠️ Usage

### 1. Launch an Implementation Mission

To start an implementation mission for a specific issue or branch:

```bash
node ${extensionPath}/bundle/orchestrator.js <IDENTIFIER> implement
```

- **IDENTIFIER**: Can be an issue number, PR number, or Git branch name.

### 2. Monitor Progress

Implementation missions run in a background `tmux` session. You can monitor the
logs:

```bash
node ${extensionPath}/bundle/check.js <IDENTIFIER>
```

### 3. Retrieve Results

Once complete, the final assessment and implemented code are available on the
remote station. The agent can then push the changes to origin.

## ⚠️ Important Guidelines

- **Autonomous Mission**: The implementation mission is fully autonomous. Let
  the agent handle the self-correction loop and test-first verification.
- **Mustard Test is Mandatory**: Always verify that the behavioral proof was
  successful.
- **Test-First Focus**: The mission prioritizes correctness through mandatory
  verification at every step.
