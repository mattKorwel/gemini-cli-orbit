# Plan: Advanced Profile & Multi-Project Management

## Objective
Support managing multiple GCP projects and networking modes via a robust "Named Profile" system.

## 1. Profile Storage
- Create a `profiles/` directory in `.gemini/orbits/`.
- Support two types of profiles:
    - **Local**: Named JSON files in the `profiles/` directory.
    - **Remote**: HTTPS/GCS URLs.

## 2. Setup Enhancements (`setup.ts`)
- **Profile Selection**:
    - At startup, scan `.gemini/orbits/profiles/`.
    - If profiles exist, present a selection menu: `[Use Existing Profile, Create New, Provide Profile URL]`.
- **Project Switching**:
    - If a profile is selected, pre-fill all defaults (Project, Zone, Backend).
- **Persistence**:
    - After setup completes, ask: `❓ Save this configuration as a named profile? (e.g. "corporate", "sandbox")`.

## 3. Configuration & Logic
- Update `scripts/Constants.ts` to include the `PROFILES_DIR`.
- Refactor `setup.ts` to handle the profile selection loop.

## 4. Verification
- Create a "sandbox" profile for a public GCP project with IAP.
- Create a "corp" profile for the internal project with magic DNS.
- Switch between them using `setup.ts` and verify `settings.json` is updated correctly.

## 5. Documentation
- Archive this plan as `.gemini/adr/advanced-profiles.md`.
