# Plan: Public Readiness & Sanitization

## Objective
Sanitize the repository of Google-internal networking patterns and personal identifiers to prepare for public release, while maintaining a robust bridge for corporate use via configuration.

## 1. Identity & Naming
- [x] **Refactor Constants.ts**: Add `DEFAULT_DNS_SUFFIX` and `DEFAULT_USER_SUFFIX` as configurable properties.
- [ ] **Sanitize identifiers**: Replace all hardcoded personal fallbacks (e.g., `'mattkorwel'`) with generic logic based on `env.USER`.
- [ ] **Prompt-driven identity**: Update `setup.ts` to confirm the derived identity during initialization.

## 2. Networking & Connectivity
- [x] **Parameterize DNS Suffix**: 
    - Public default: `.c.<project-id>.internal`
    - Corporate override: User can provide `.internal.gcpnode.com` during `setup.ts`.
- [ ] **Multi-Backend Support**: Update `GceConnectionManager.ts` to support different connection strategies:
    - **`direct-internal`**: Current magic hostname logic (Fastest, VPC-internal).
    - **`external`**: Use the instance's Public IP (if enabled).
    - **`iap`**: Use `gcloud compute ssh --tunnel-through-iap` (Secure fallback for off-VPC).
- [ ] **Backend Selection**: Update `setup.ts` to prompt for the preferred connectivity backend.

## 3. Configuration & Shared Settings
- [ ] **Workspace-Specific Settings**: Store `dnsSuffix`, `userSuffix`, and `backendType` in `.gemini/workspaces/settings.json`.
- [ ] **Shared Settings Loader**: 
    - Implement a `fetchRemoteSettings(url)` utility in `setup.ts`.
    - Allow users to provide a URL (HTTPS or GCS) during setup to bootstrap team-wide defaults (e.g., standard zone, DNS suffix, and backend).
- [ ] **Environment Variable Support**: Prioritize `WORKSPACE_*` env vars for automatic headless setup.


## 4. Documentation & ADR
- [ ] **Archive this Plan**: Copy this finalized plan to `.gemini/adr/public-readiness-v2.md` in the repository.
- [ ] **Review docs/**:
    - [ ] `NETWORK_RESEARCH.md`: Generalize the explanation of IAP vs Direct SSH.
    - [ ] `NEXT_MISSION.md`: Remove specific instance names like `gcli-workspace-mattkorwel`.
- [ ] **Update README.md**: Ensure URLs point to the public repo location.

## 5. Verification
- [ ] Run `npm test` to ensure refactored identity logic doesn't break providers.
- [ ] Run a final `grep` for "google" and "mattkorwel" to ensure no leakage.
