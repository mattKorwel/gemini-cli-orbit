# Orbit Mission Maneuvers: Consolidated Autonomous Missions

This document details the high-performance, phased missions implemented in
Gemini Orbit. These maneuvers are designed to bridge "The Verification Gap" by
enforcing mandatory behavioral proof and deep context alignment.

> [!NOTE] Currently **optimized for NPM/Node.js**. Automated build, test, and
> behavioral proof phases currently rely on standard Node.js project patterns
> (`package.json`, `npm` scripts). These steps will be automatically skipped or
> downgraded on non-Node repositories.

---

## Maneuver: Review

The **Review Mission** provides a high-fidelity, parallelized PR review that
ensures consistent quality and reduces manual overhead.

### Architecture: Phased Parallel Execution

The review mission is orchestrated in TypeScript and executed in three distinct
phases. All background tasks log to specialized `.md` files in the mission log
directory (`.gemini/logs/orbit-review-<PR>/`).

#### Phase 0: Context Acquisition (Parallel)

Before evaluation begins, the mission fetches all necessary shared context
simultaneously:

1.  **PR Metadata**: Fetches PR body, target branches, and closing issue
    references.
2.  **Mission Context Synthesis**: Combines the PR description with a recursive
    fetch (up to 3 levels) of linked GitHub issue hierarchies.
3.  **PR Diff**: Fetches the complete diff once and saves it as `pr-diff.diff`.
4.  **Single-Source Build**: Performs a full `npm ci` and `npm run build`.
5.  **Conflict Check**: Performs a merge-conflict check against the base branch.

#### Phase 1: Parallel Evaluation

Once Phase 0 context is ready, N parallel tasks are launched:

- **Task CI (Status)**: Monitors GitHub Actions and triages failures using
  dynamic repo detection.
- **Task Static (Rules)**: Analyzes the diff against Repo-Specific Development
  Guidelines and the synthesized Mission Context.
- **Task Feedback (Comments)**: Analyzes all unresolved PR comment threads via
  GraphQL.
- **Behavioral Proof**: **Mandatory**. Physically exercises the code in the
  terminal using the build logs and diff.

#### Phase 2: Final Synthesis (Sequential)

A supervisor merges all findings into a high-fidelity `final-assessment.md`.

### 🚀 Usage

```bash
orbit mission launch <PR_NUMBER> review
```

---

## Maneuver: Fix

The **Fix Mission** provides an automated, iterative remediation loop that moves
a Pull Request to a "Ready to Merge" state.

### Architecture: Diagnostic-Remediation Loop

The fix mission leverages the diagnostic infrastructure of the review maneuver
but introduces a sequential remediation phase to safely apply code changes.

#### Phase 0: Diagnostic Context (Parallel)

Reuses the context acquisition from the Review maneuver to identify:

- Merge conflicts with the base branch.
- CI/Build failures and specific test errors.
- Outstanding reviewer comments and feedback threads.

#### Phase 1: Sequential Remediation

Remediation tasks are executed sequentially to prevent file-system race
conditions:

1.  **Sync & Conflict resolution**: Gemini resolves any merge conflicts with the
    base branch.
2.  **CI & Build Repair**: Automatically analyzes failures and fixes tests, type
    errors, and lint issues.
3.  **Feedback Addressing**: Implements code changes based on outstanding
    reviewer comments.

#### Phase 2: Verification & Synthesis

- **Final Verification Build**: Ensures the repository remains in a buildable
  state.
- **Behavioral Proof (Proof)**: Physically verifies the fixes in the terminal
  and provide logs.
- **Synthesis**: Merges all remediation logs and proof into a standardized
  `final-fix-assessment.md`.

### 🚀 Usage

```bash
orbit mission launch <PR_NUMBER> fix
```

---

## Maneuver: Implement

The **Implement Mission** provides a high-fidelity, phased approach to feature
development and bug fixing based on GitHub issues. It enforces a "Think Before
Code" workflow with deep context alignment and mandatory verification.

### Architecture: Research-Plan-Execute-Verify

The implementation mission follows a structured lifecycle to ensure quality and
architectural alignment.

#### Phase 0: Deep Context & Research (Parallel)

Before any code is modified, the mission performs comprehensive research:

1.  **Issue Hierarchy**: Fetches the target issue, its parent, grandparent,
    children, and siblings (up to 3 levels).
2.  **Synthesis**: Combines hierarchy and repository guidelines into a
    `mission-context.md`.
3.  **Codebase Analysis**: Performs a targeted analysis of relevant modules and
    dependencies.

#### Phase 1: Planning & Review (Sequential)

Gemini generates a detailed `implementation-plan.md` which is then reviewed by
an automated "Critic" against requirements and guidelines. The plan is revised
until approved (or max attempts reached).

#### Phase 2: Sequential Implementation

The agent implements the plan in small chunks (~10-15 minutes).

1.  **Test-First**: Each chunk begins by creating or updating a reproduction
    test.
2.  **Implementation**: The agent modifies the source code to satisfy the test.
3.  **Verification**: The test is run immediately to confirm the chunk's
    success.

#### Phase 3: Quality Control & Synthesis

- **Final Build & Test**: Runs the full project test suite.
- **Local Review**: An automated review of the changes against the mission
  context.
- **Behavioral Proof (Proof)**: Physically verifies the implementation in the
  terminal with logs.
- **Final Assessment**: Merges all logs and proof into a
  `final-implementation-assessment.md`.

### 🚀 Usage

```bash
orbit mission launch <ISSUE_NUMBER> implement
```

---

## 🎮 Command Reference

### 1. Constellation (The Fleet View)

_Unified status, health, and monitoring across your entire constellation._

| Maneuver      | Command                         | Description                                     |
| :------------ | :------------------------------ | :---------------------------------------------- |
| **Inventory** | `orbit constellation`           | View registered stations (fast).                |
| **Telemetry** | `orbit constellation --pulse`   | Deep dive into mission logs and resource stats. |
| **Surgical**  | `orbit constellation -n <name>` | Target a specific station by name.              |

### 2. Mission (The Workflow)

_Focused on the PR or Issue you are working on._

| Maneuver     | Command                          | Description                                        |
| :----------- | :------------------------------- | :------------------------------------------------- |
| **Chat**     | `orbit mission launch <id> chat` | **Drop in or resume.** Starts or reuses a mission. |
| **Shell**    | `orbit mission shell <id>`       | **Side-terminal.** Raw bash in mission capsule.    |
| **Uplink**   | `orbit mission uplink <id>`      | View latest mission telemetry and logs.            |
| **Attach**   | `orbit mission attach <id>`      | Re-attach to the persistent terminal session.      |
| **Jettison** | `orbit mission jettison <id>`    | Cleanup mission-specific worktree and capsule.     |

### 3. Station (The Hardware)

_Focused on managing the lifecycle of compute instances._

| Maneuver      | Command                          | Description                                 |
| :------------ | :------------------------------- | :------------------------------------------ |
| **Activate**  | `orbit station activate <name>`  | Set the active target for future missions.  |
| **Hibernate** | `orbit station hibernate <name>` | Safe compute-only shutdown to save cost.    |
| **Shell**     | `orbit station shell [name]`     | **Host Access.** Raw shell on hardware VM.  |
| **Reap**      | `orbit station reap`             | Automatic cleanup of idle mission capsules. |
| **Delete**    | `orbit station delete <name>`    | Decommission station hardware.              |

### 4. Infra (The Foundation)

_Focused on provisioning and blueprints._

| Maneuver       | Command                         | Description                               |
| :------------- | :------------------------------ | :---------------------------------------- |
| **Liftoff**    | `orbit infra liftoff <name>`    | Idempotent build or wake of a station.    |
| **Splashdown** | `orbit infra splashdown <name>` | Full decommissioning of station hardware. |
| **Schematic**  | `orbit infra schematic list`    | Manage infrastructure blueprints.         |

### 4. Config (The Local)

_Focused on setup and integration._

| Maneuver    | Command                | Description                       |
| :---------- | :--------------------- | :-------------------------------- |
| **Install** | `orbit config install` | Shell aliases and tab-completion. |
