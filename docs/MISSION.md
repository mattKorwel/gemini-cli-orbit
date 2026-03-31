# Orbit Mission: Launch (orbit mission)

The **Mission** command is the primary way to launch your developer presence
into an isolated orbital environment. It creates a dedicated **Mission Capsule**
for a specific Pull Request or task. Missions can be **Interactions**
(manual/chat-first) or **Maneuvers** (autonomous/task-first).

## 🚀 Mission Modes

Launch a mission by providing a PR number or branch:

```bash
orbit mission 123
```

### 1. Manual Interaction Modes (Default)

These modes are for hands-on work inside the capsule alongside the agent.

- `orbit mission 123` (Default): Opens an interactive **Gemini CLI** session.
- `orbit mission 123 "your prompt"`: Executes the prompt in Gemini and stays
  open.
- `orbit mission 123 shell`: Drops you into a raw **Bash** shell in the
  worktree.

### 2. Autonomous Mission Maneuvers

Execute specialized autonomous tasks on your mission:

- `orbit mission 123 review`: Parallel analysis, build, and behavioral proof.
- `orbit mission 123 fix`: Iterative CI repair and conflict resolution.
- `orbit mission 123 implement`: Feature execution with test-first logic.

[Learn more about Maneuvers](./MANEUVERS.md).

> [!NOTE] **Compatibility**: While Orbit infrastructure is language-agnostic,
> high-fidelity maneuvers (`review`, `fix`, `implement`) are currently
> **optimized for NPM/Node.js**. Advanced phases like automated builds and
> behavioral proofs will be skipped on non-Node repositories.

---

## ✨ Quick Commands

- `orbit mission <PR> [action]`: Launch a mission (fix, review, implement).
- `orbit pulse`: Monitor host and capsule health.
- `orbit uplink <PR> [action]`: (Uplink) Inspect local or remote mission
  telemetry.
