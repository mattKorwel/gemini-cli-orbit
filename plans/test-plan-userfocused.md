# Orbit User Journey: From Zero to Mission Control (v6.0)

This document provides a narrative, end-to-end walkthrough for testing the
**Gemini Orbit** platform from the perspective of an engineer. It covers both
Local and Remote workflows, focusing on the "story" and usability of the new
Release 6 features.

---

## 🏁 Phase 1: The Local Sprint (Speed & Isolation)

_Scenario: "I'm working on a local repo and I want to review a PR without
messing up my current `main` branch state."_

1.  **Initialize & Blueprint**:
    - Command: `orbit schematic list`
    - **Check**: Do you see the default blueprints? Is the terminology
      consistent (Schematic, not Design)?
2.  **Launch Local Mission**:
    - Command: `orbit mission 21 review --local` (or
      `orbit mission 21 --local review`)
    - **Observation**: Does it correctly resolve PR 21? Does it create a sibling
      worktree in your project's parent directory?
    - **The "Review" Story**: Watch it go through Phase 0 (Context), Phase 1
      (Evaluation), and Phase 2 (Synthesis).
3.  **Inspect the logs**:
    - Command: `orbit uplink 21`
    - **Check**: Does it show you the log files generated? Can you see the
      `final-assessment.md`?
4.  **Take the Helm**:
    - Command: `orbit mission 21` (Interactive Chat) or `orbit mission 21 shell`
      (Raw Bash)
    - **Check**: Does it drop you into the worktree? Is it a persistent `tmux`
      session named `orbit-review-release-6`?
5.  **Local Cleanup (Jettison)**:
    - Command: `orbit jettison 21`
    - **Check**: Is the sibling directory gone? Is the tmux session killed?

---

## 🛰️ Phase 2: The Remote Outpost (Cloud Persistence)

_Scenario: "I need a high-performance station that stays alive even when I close
my laptop."_

1.  **Design the Schematic**:
    - Command: `orbit schematic create corp`
    - **Interactive**: Follow the wizard. Use your real GCP Project/Zone.
    - **Verification**: `cat ~/.gemini/orbit/schematics/corp.json` to see the
      results.
2.  **The "Liftoff" Moment**:
    - Command: `orbit station liftoff corp --setup-net --with-station`
    - **Observation**: This is the critical "User Moment." It should provision
      the VPC, NAT, and the GCE VM.
    - **Check**: Does it end with "🎯 Active Station set to:
      station-supervisor"?
3.  **The Pulse Check**:
    - Command: `orbit pulse`
    - **Check**: Do you see your new station as `RUNNING`? Does the header say
      "ORBIT PULSE"?
4.  **Launch a Remote Mission**:
    - Command: `orbit mission 21 review`
    - **Verification**: Run `orbit uplink 21` immediately to stream the logs.
    - **Persistence Test**: **Close your terminal app or disconnect your
      Wi-Fi.** Re-open and run `orbit uplink 21` again. Are you exactly where
      you left off?

5.  **Security Audit (Under the Hood)**:
    - **Action**: While the mission is running, run `orbit pulse`.
    - **Check**: Does it show `🧠 [THINKING]`?
    - **Deep Check**: SSH into the station manually. Run `ls /dev/shm`. Do you
      see the `.gcli-env-*` secret file? Run `docker inspect gcli-21-review`. Is
      the API key safely mounted?

---

## 🎭 Phase 3: The Power User (Multi-Mission)

_Scenario: "I'm juggling two things at once."_

1.  **Parallel Launch**:
    - Run `orbit mission 21 fix`
    - In a new tab, run `om 5 implement` (assuming an issue #5 exists).
2.  **Monitor the Constellation**:
    - Command: `orbit pulse`
    - **Check**: Do you see BOTH capsules? Does it show different CPU/Mem stats
      for each? Does it distinguish between `THINKING` and `WAITING`?
3.  **Global Splashdown**:
    - Command: `orbit splashdown --all`
    - **Check**: Does it stop the VM? Does it clear the local registry receipts
      for that station?

---

## 🛠️ Automated Health Check (Post-Journey)

```bash
# Verify the build is still clean after all experiments
npm run build && npm test

# Verify MCP server integrity
node bundle/bin/mcp-server.js
```
