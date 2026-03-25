# Plan: Granular Workspace State Dashboard

## Objective
Enhance the `status` command to provide "At-a-Glance" intelligence about what exactly is happening inside each isolated container.

## 1. State Definitions

| State | Technical Indicator | Dashboard Label |
| :--- | :--- | :--- |
| **Ready** | Container exists, but no `tmux` session is active. | `💤 [IDLE] (Ready for work)` |
| **Busy** | `tmux` exists, but the Gemini prompt `> ` is not visible. | `🧠 [THINKING] (Agent is active)` |
| **Input** | `tmux` exists AND the prompt `> ` is visible at the bottom. | `✋ [WAITING] (Needs your input!)` |

## 2. Technical Implementation

### Phase 1: Screen Capture Utility
- Update `GceCosProvider.ts` (or a helper) to implement `capturePane(container: string)`:
  - Command: `sudo docker exec <container> tmux capture-pane -pt <session>`

### Phase 2: Heuristic Analysis in `status.ts`
- Iterate through each `gcli-*` container.
- If a `tmux` session exists:
    1. Capture the last 2 lines of the pane.
    2. Check for the `> ` prompt or common "Done" indicators.
    3. Determine the state based on the match.

### Phase 3: Visual Polish
- Use colorized labels (Green for Thinking, Yellow for Waiting, Blue for Idle).
- Add a "Time Active" indicator using `tmux` metadata if possible.

## 3. Verification
- Launch a workspace and ask a long-running question. Run `status` and verify it shows `[THINKING]`.
- Wait for it to finish. Run `status` and verify it shows `[WAITING]`.
- Exit the session but keep the container. Verify it shows `[IDLE]`.
