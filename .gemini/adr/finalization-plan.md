# Finalization & Quality Assurance Plan

## Objective
Final verification and rollout of the Gemini Workspaces Extension and its modernized Docker infrastructure.

---

## 1. Docker & Image Lifecycle
- [ ] **Trigger Build**: Manually trigger the GCP Cloud Build for the `development` image via the `development-worker.yml` config.
- [ ] **Image Verification**: Once built, pull the image locally and verify the "Lean" strategy:
    ```bash
    docker run us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest which g-nightly g-preview gemini gh tmux
    ```
- [ ] **PR Merge**: Merge PR #23814 in the `gemini-cli` repository.

## 2. End-to-End (E2E) Lifecycle Test
Perform a "Day 0" test from a clean slate:
- [ ] **Full Setup**: Run `/workspace:setup --reconfigure`.
- [ ] **Remote Link Check**: Verify that `gemini extensions list` inside the remote container shows `workspaces@1.1.0`.
- [ ] **Autonomous Loop**: Run `/workspace:review <some-pr>` to verify the ported `review-pr` skill and the remote supervisor logic.

## 3. Multi-Project / Multi-Backend Validation
- [ ] **Profile Switch**: Use setup to switch from `corp` (magic DNS) to a standard GCP project using the `iap` backend.
- [ ] **Command Persistence**: Verify that `/workspace:status` still correctly targets the active worker after a profile switch.

## 4. Documentation & Cleanup
- [ ] **README Audit**: Ensure all new slash commands are correctly documented with their arguments.
- [ ] **GEMINI.md Audit**: Verify the "Shared State" architecture section is clear for future developments.
- [ ] **Artifact Cleanup**: Delete all temporary session files.

## 5. Official Release
- [ ] **Repo Visibility**: Set the `gemini-workspaces-extension` repository to **Public**.
- [ ] **Marketplace Tag**: Add the `gemini-cli-extension` topic to the repository to enable discovery.
