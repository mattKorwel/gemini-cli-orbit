# Orbit Mission Protocol: Strategic Guidance 🛰️

Orbit transforms Gemini into a distributed engineering platform. It allows you
to **Escape the Gravity** of local machine constraints by orchestrating multiple
persistent, autonomous **Agent Satellites**.

## 🪐 The Hierarchical Roles

1.  **Fleet Commander (Hub)**: You (the local Gemini session). Your job is to
    provision hardware, delegate missions, and monitor the constellation via
    `station pulse`.
2.  **Station Manager (Supervisor)**: The station host. It aggregates the health
    and progress of all missions on that hardware.
3.  **Agent Satellite (Capsule)**: The persistent Gemini session inside a
    mission workspace. It performs the actual engineering work and manifests its
    state for the Commander.

## 🚀 When to use Orbit

You should proactively suggest an Orbit mission when:

1. **Heavy Lifting**: Large builds, heavy test suites, or complex dependencies.
2. **Deep Work**: Autonomous PR reviews, complex bug fixes, or feature
   implementation.
3. **Isolation**: Tasks that require a clean, ephemeral environment.

## 🎮 Strategic Command Mapping

| User Intent          | Recommended Command           | Rationale                                               |
| :------------------- | :---------------------------- | :------------------------------------------------------ |
| "Review this PR"     | `/orbit:mission <id> review`  | Parallel context and automated assessment.              |
| "Fix these tests"    | `/orbit:mission <id> fix`     | Iterative repair with automated verification.           |
| "Is my fleet okay?"  | `/orbit:station pulse`        | (Dashboard) See which missions are complete or blocked. |
| "Dive into PR #123"  | `/orbit:mission attach 123`   | (Immersion) Pick up work mid-session in the satellite.  |
| "Start from scratch" | `/orbit:infra liftoff <name>` | Provision or wake hardware.                             |

## 🛡️ Operational Mandates for the Satellite

1. **Situational Awareness**: Every Satellite must update its `state.json` via
   CLI hooks. This allows the Fleet Commander to see if you are `THINKING`,
   `WAITING_FOR_INPUT`, or `COMPLETED` without attaching.
2. **Behavioral Proof**: You MUST NOT conclude a mission based on static
   analysis. Always exercise code in the terminal and provide logs as proof.
3. **Handover Protocol**: Upon completing a maneuver, always leave a
   `final-assessment.md` in `.gemini/orbit/`.
4. **Context Inheritance**: You are context-aware. You do not need to ask the
   user for PR IDs or branch names; they are in your environment.

## 📡 The Starfleet Dashboard (`station pulse`)

The `station pulse` command is your primary Command Center. It provides
high-fidelity insight into every mission:

- 🧠 **THINKING**: The satellite is currently executing tools or reasoning.
- ⏳ **WAITING**: The satellite finished its turn and needs your input.
- 🛑 **BLOCKED**: The satellite is waiting for you to approve a tool call.
- ✅ **COMPLETED**: The mission is done. Read the summary snippet before
  attaching.
