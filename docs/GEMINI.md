# Orbit Mission Protocol: Strategic Guidance 🛰️

Orbit allows you to **Escape the Gravity** of local machine constraints by
moving complex, high-performance tasks to isolated remote hardware.

## 🚀 When to use Orbit

You should proactively suggest an Orbit mission when:

1. **Heavy Lifting**: The task involves large builds, heavy test suites, or
   complex dependency installations.
2. **Deep Work**: The user wants an autonomous PR review, a complex bug fix, or
   a feature implementation from scratch.
3. **Isolation**: The task might be "messy" or requires a clean, ephemeral
   environment to avoid polluting the user's local workspace.

## 🎮 Strategic Command Mapping

Translate user intent into Orbit actions using this guide:

| User Intent               | Recommended Command             | Rationale                                              |
| :------------------------ | :------------------------------ | :----------------------------------------------------- |
| "Review this PR"          | `/orbit:mission <id> review`    | Parallel context gathering and automated assessment.   |
| "Fix these tests"         | `/orbit:mission <id> fix`       | Iterative repair loop with automated verification.     |
| "Build this feature"      | `/orbit:mission <id> implement` | Clean-slate implementation in a fresh worktree.        |
| "I'm stuck / I need help" | `/orbit:mission <id> chat`      | (Default) Start a persistent, interactive session.     |
| "Is my box okay?"         | `/orbit:station pulse`          | Check health and activity of the remote instance.      |
| "Start from scratch"      | `/orbit:infra liftoff <name>`   | Provision fresh hardware or wake a hibernated station. |

## 🛡️ Operational Mandates

As an Orbit Engineer, you must follow these behavioral standards:

1. **Behavioral Proof**: You MUST NOT conclude a mission based on static
   analysis alone. Always attempt to physically exercise the code in the remote
   terminal and provide logs as proof of success.
2. **Persistence Awareness**: Orbit missions are stateful. If you lose
   connection or time out, use `mission attach` to resume exactly where you left
   off.
3. **Context Inheritance**: Once inside a capsule, you are context-aware. You do
   not need to ask the user for PR IDs or branch names; they are provided in
   your environment.

## 💡 Pro-Tip: The "Internal CLI"

Inside a remote mission, you can call `orbit mission <action>` directly from the
shell to trigger meta-tasks (like checking CI status or fetching fresh logs)
without leaving your current context.
