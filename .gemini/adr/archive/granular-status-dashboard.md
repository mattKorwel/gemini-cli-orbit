# Plan: Granular Orbit State Dashboard

## Objective

Enhance the `status` command to provide "At-a-Glance" intelligence about what
exactly is happening inside each isolated container.

## 1. State Definitions

| State     | Technical Indicator                                         | Dashboard Label                    |
| :-------- | :---------------------------------------------------------- | :--------------------------------- |
| **Ready** | Container exists, but no `tmux` session is active.          | `💤 [IDLE] (Ready for work)`       |
| **Busy**  | `tmux` exists, but the Gemini prompt `> ` is not visible.   | `🧠 [THINKING] (Agent is active)`  |
| **Input** | `tmux` exists AND the prompt `> ` is visible at the bottom. | `✋ [WAITING] (Needs your input!)` |

## 2. Technical Implementation

### Phase 1: Screen Capture Utility

- Update `GceCosProvider.ts` (or a helper) to implement
  `capturePane(container: string)`:
  - Command: `sudo docker exec <container> tmux capture-pane -pt <session>`

### Phase 2: LLM-Powered Analysis

- Implement `getLlmState(paneOutput)` in `status.ts`.
- Use a fast model (Gemini Flash) to analyze the last 10 lines of the capture.
- Provide a heuristic fallback if the API call fails or is too slow.

### Phase 3: Visual Polish

- Use colorized labels (Green for Thinking, Yellow for Waiting, Blue for Idle).
- Add a "Time Active" indicator using `tmux` metadata if possible.

## 3. Verification

- Launch a orbit and ask a long-running question. Run `status` and verify it
  shows `[THINKING]`.
- Wait for it to finish. Run `status` and verify it shows `[WAITING]`.
- Exit the session but keep the container. Verify it shows `[IDLE]`.
