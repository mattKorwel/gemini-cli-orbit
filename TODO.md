- [ ] Auth: Explore 'Auth Pass-through' (non-recommended) to leverage local gh
      CLI auth on remote stations without manual PAT injection.
- [x] UX: Show 'Establishing mission uplink...' message when connecting to
      remote station.
- [x] UX: Add 'uplink'/connectivity status verbage when attempting remote
      communication (e.g. '📡 Establishing mission uplink...')
- [x] UI: Fix 'verifying access' step to clearly fail if connectivity is not
      established instead of silently proceeding to remote initialization.
- [x] Security: Verify that .gemini/orbit/gh_token is never accidentally
      committed (it is currently ignored by global .gemini rules).
- [x] Fork Logic: Do not attempt to fork if the repository is already owned by
      the user.
- [x] UI: Fix odd printing/alignment of fork logic output compared to networking
      section.
- [x] Security: Migrated repository tokens to global storage
      (~/.gemini/orbit/tokens/) to prevent accidental commits.
- [x] Resolve disk size warnings on VM creation (boot disk 200GB vs 10GB image
      noise)
- [x] Orbit: Implement Consolidated "Implement Mission" (ADR 11)
  - [x] Draft ADR 11
  - [x] Create implementation plan
  - [x] Create `fetch-implement-context.ts` for deep hierarchy research
  - [x] Refactor `implement.ts` playbook to use `TaskRunner` and phased
        execution
  - [x] Update `station.ts` to ensure full integration
  - [x] Update `docs/MISSION_PLANS.md` with new maneuver details
  - [x] Verify implementation with manual test
