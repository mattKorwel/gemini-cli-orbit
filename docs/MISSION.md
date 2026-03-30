# Orbit Mission: Launch (/orbit:mission)

The **Mission** command is the primary way to launch your developer presence
into an isolated orbital environment. It creates a dedicated **Mission Capsule**
for a specific Pull Request or task.

## 🚀 Mission Modes

Launch a mission by providing a PR number:

```bash
/orbit:mission 123
```

### 1. Interactive Agent Session (Default)

Orbit will create a persistent mission capsule, clone your repository (via Git
Reference Clone), and launch a Gemini CLI interactive session.

- You can work alongside the agent in this environment.
- The session is persistent—you can disconnect and re-attach at any time.

### 2. Autonomous Mission Maneuvers

Execute specialized autonomous tasks on your mission:

- `/orbit:mission 123 fix`: Execute an automated fix playbook. The agent will
  attempt to identify and correct issues within the PR.
  [Learn more](./MANEUVERS.md#maneuver-fix).
- `/orbit:mission 123 review`: Launch a deep PR review.
  [Learn more](./MANEUVERS.md#maneuver-review).
- `/orbit:mission 123 implement`: Direct the agent to implement a specific
  feature or change request based on PR descriptions.
  [Learn more](./MANEUVERS.md#maneuver-implement).

> [!NOTE] **Compatibility**: While Orbit infrastructure is language-agnostic,
> high-fidelity maneuvers (`review`, `fix`, `implement`) are currently
> **optimized for NPM/Node.js**. Advanced phases like automated builds and
> behavioral proofs will be skipped on non-Node repositories.

### 3. Extra-Vehicular Activity (EVA)

For direct manual control without the Gemini agent:

```bash
/orbit:mission 123 eva
```

This drops you into a raw bash shell inside the mission capsule. This is ideal
for manual debugging or custom build operations.

---

## 🛰️ How Missions Work

When you run a mission:

1.  **Capsule Creation**: A process-isolated Docker container is spawned on your
    Host Station.
2.  **Repo Mirroring**: A fresh git clone is created inside the capsule,
    referencing the Station's master mirror for near-instant speed.
3.  **State Restore**: Your terrestrial configuration (UI, shell aliases,
    extensions) is mounted into the capsule.
4.  **Persistent Tmux**: The session is wrapped in `tmux`, allowing you to
    safely disconnect without interrupting any running processes.

## ✨ Quick Commands

- `/orbit:mission <PR> [action]`: Launch a mission (fix, review, implement).
- `/orbit:mission <PR> eva`: Raw bash access to the capsule.
- `/orbit:pulse`: Monitor host and capsule health.
- `/orbit:uplink <PR> [action]`: Stream real-time logs from a remote capsule.
- `/orbit:blackbox <PR> [action]`: Inspect recorded local mission logs.
