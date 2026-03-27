# Plan: Mission Control Expansion (Skill Porting)

## Objective
Port high-value automated workflows from the `mk-offload` branch into the Gemini Orbits Extension.

## 1. Ported Skills
- **`ci`**: Monitor GitHub Actions and automatically extract failure logs.
- **`async-pr-review`**: Background PR review triggers that run on the remote worker without blocking the local CLI.
- **`fix-pr`**: Automatic "Self-Healing" loop that waits for CI to fail and then attempts a fix.
- **`review-pr`**: Advanced review logic that analyzes failures across multiple packages.

## 2. Remote Playbooks
Integrate the "Supervisor" loops that run inside the `development` worker:
- **`implement`**: Autonomous Research -> Test -> Fix loop for issues.
- **`review`**: Systematic PR analysis.
- **`fix`**: Automated PR failure resolution.

## 3. Extension Integration
- Register new namespaced commands:
    - `/orbit:review <pr>`
    - `/orbit:fix <pr>`
    - `/orbit:implement <issue>`
- Update `scripts/orchestrator.ts` to support these new entry points.

## 4. Documentation
- Archive this plan as `.gemini/adr/mission-control-expansion.md`.
