# Orbit Mission: Attach (/orbit:attach)

The **Attach** command allows you to jump directly into a running Mission Capsule on your Host Station. This is the primary way to take manual control of an ongoing mission.

## 🔗 Persistence & Re-attachment
Because Orbit sessions are persistent (wrapped in `tmux` within the capsule), you can safely disconnect and re-attach at any time.

Attach to a specific mission by providing the PR number:
```bash
/orbit:attach 123
```

### 1. Unified Interaction
When you attach, you enter the exact environment where the Gemini agent is working.
- **Shared Terminal**: You and the agent share the same terminal state.
- **Manual Overrides**: You can manually fix a build, run a test, or edit a file, and the agent will detect your changes.
- **Hardware Freedom**: Close your laptop, switch to a different machine, and `/orbit:attach` again to resume right where you were.

### 2. Advanced Terminal Handling (macOS + iTerm2)
If you are running the Gemini CLI on macOS with iTerm2, `/orbit:attach` will automatically:
- Open a new iTerm2 tab.
- Establish the secure tunnel to your Host Station.
- Attach to the correct `tmux` session within the Mission Capsule.

---

## 🛠️ Attachment Options
- `/orbit:attach <PR> [action]`: Attach to a specific PR workstream (e.g., `orbit:attach 123 review`).
- `/orbit:attach <PR> --local`: Attach within your current terminal session instead of opening a new tab (useful for nested sessions).

## ✨ Key Benefits
- **Manual Debugging**: If an autonomous mission hits a roadblock, attach and clear it manually.
- **Real-time Monitoring**: Watch the agent work in real-time as it executes complex refactors.
- **Context Preservation**: Your shell history, environment variables, and active processes are preserved within the capsule.
