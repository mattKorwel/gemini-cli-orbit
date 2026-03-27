# Plan: Public Readiness & Sanitization

## Objective
Sanitize the repository of Google-internal networking patterns and personal identifiers to prepare for public release.

## 1. Identity & Naming
- [ ] **Refactor Constants.ts**: Add `DEFAULT_DNS_SUFFIX` and `DEFAULT_USER_SUFFIX` as configurable properties.
- [ ] **Remove personal fallbacks**: Replace `env.USER || 'mattkorwel'` with a prompt-driven identity in `setup.ts`.

## 2. Networking & DNS
- [ ] **Parameterize DNS Suffix**: 
    - Public default: `.c.<project-id>.internal`
    - Corporate override: User can provide `.internal.gcpnode.com` during `setup.ts`.
- [ ] **Generalize Username logic**: 
    - Public default: Standard OS Login (`node` or `env.USER`)
    - Corporate override: Support the `_google_com` pattern via a new `userSuffix` config field.

## 3. Shared Internal Configuration
- [ ] **GCS/Internal repo Distribution**: 
    - Instead of hardcoding internal patterns, the team can use a pre-baked `settings.json` distributed via an internal repo or GCS bucket. 
    - `setup.ts` will be updated to accept a `--config-url` or `--profile` flag to pull these pre-sets.

## 3. Documentation Sanitization
- [ ] **Review docs/**:
    - [ ] `NETWORK_RESEARCH.md`: Generalize the explanation of IAP vs Direct SSH.
    - [ ] `NEXT_MISSION.md`: Remove specific instance names like `gcli-orbit-mattkorwel`.
- [ ] **Update README.md**: Ensure URLs point to the public repo location.

## 4. Verification
- [ ] Run `npm test` to ensure refactored identity logic doesn't break providers.
- [ ] Run a final `grep` for "google" and "mattkorwel" to ensure no leakage.
