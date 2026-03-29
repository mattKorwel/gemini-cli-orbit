---
name: orbit
description:
  Expertise in managing and utilizing Gemini Orbit for high-performance remote
  development tasks.
---

# Gemini Orbit Skill

This skill enables the agent to utilize **Gemini Orbit**—a high-performance,
persistent remote development platform. It allows the agent to move intensive
tasks (PR reviews, complex repairs, full builds) from the local environment to a
dedicated cloud station using isolated **Orbit Capsules**.

## 🛠️ Key Capabilities

1. **Persistent Execution**: Jobs run in remote `tmux` sessions. Disconnecting
   or crashing the local terminal does not stop the remote work.
2. **Parallel Infrastructure**: The agent can launch a heavy task (like a full
   build or CI run) in an Orbit capsule while continuing to assist the user
   locally.
3. **Behavioral Fidelity**: Remote stations have full tool access (Git, Node,
   Docker, etc.) and high-performance compute, allowing the agent to provide
   behavioral proofs of its work.

## 📋 Instructions for the Agent

### When to use Orbit

- **Intensive Tasks**: Full preflight runs, large-scale refactors, or deep PR
  reviews.
- **Persistent Logic**: When a task is expected to take longer than a few
  minutes and needs to survive local connection drops.
- **Environment Isolation**: When you need a clean, high-performance environment
  to verify a fix without polluting the user's local machine.

### Mission-Specific Skills

This extension provides specialized skills for common missions. You SHOULD use
these for detailed procedural guidance:

- **`orbit-review`**: High-fidelity PR reviews (Phase 0-2, Mustard Test).
- **`orbit-fix`**: Automated CI repair and conflict resolution.
- **`orbit-implement`**: Autonomous feature execution with self-correction and
  test-first logic.
- **`orbit-ci`**: High-performance CI monitoring and failure replication.

### How to use Orbit

1. **Setup**: If the user hasn't initialized their environment, you MUST run the
   setup script using node and the absolute path.
   ```bash
   node ${extensionPath}/bundle/setup.js
   ```
2. **Launch a Mission**: Start a playbook for a specific PR or Git branch:

   ```bash
   node ${extensionPath}/bundle/orchestrator.js <IDENTIFIER> [action]
   ```

   - **IDENTIFIER**: Can be a Pull Request number or a Git branch name.
   - **Actions**: `review` (default), `fix`, `implement`, `ready`.

3. **Check Status**: See global state and active sessions:
   ```bash
   node ${extensionPath}/bundle/status.js
   ```
   Or deep-dive into specific mission logs:
   ```bash
   node ${extensionPath}/bundle/check.js <IDENTIFIER>
   ```
4. **Cleanup**:
   - **Bulk**: Clear all capsules/worktrees:
     ```bash
     node ${extensionPath}/bundle/clean.js --all
     ```
   - **Surgical**: Kill a specific Orbit capsule:
     ```bash
     node ${extensionPath}/bundle/clean.js <IDENTIFIER> <action>
     ```
5. **Fleet**: Manage VM lifecycle:
   ```bash
   node ${extensionPath}/bundle/fleet.js [stop|provision|list]
   ```
6. **Attach/Logs**:
   ```bash
   node ${extensionPath}/bundle/attach.js <IDENTIFIER>
   node ${extensionPath}/bundle/logs.js <IDENTIFIER>
   ```

## ⚠️ Important Constraints

- **NO NPM**: Do NOT attempt to use `npm run` or `npm orbit`. Those commands are
  deprecated in favor of running the extension bundles directly.
- **node**: Always use `node` followed by the absolute path to the bundle in
  `${extensionPath}/bundle/*.js`.
- **Absolute Paths**: Always use absolute paths (e.g., `/mnt/disks/data/...`)
  when orchestrating remote commands.
