# Plan: OS-Independent Snapshot Stabilization

## Summary

- Fix the current Windows and CI snapshot drift by separating runtime path
  translation from test-only normalization.
- Keep provider polymorphism intact by centralizing station host-path
  translation behind the hydrated mount/area model.
- Keep upfront hydration intact by deriving runtime paths from hydrated config
  and mount areas, not from scattered platform checks.

## Key Changes

- Add a shared station path resolver for capsule-to-host translation and use it
  from the station runtime layers.
- Keep secret env staging on the `/dev/shm` contract while resolving host paths
  through the shared mount map.
- Add a shared behavior snapshot normalizer for path placeholders, shell wrapper
  noise, executable suffixes, env volatility, and timestamped names.
- Replace one-off snapshot cleanup in behavior specs with the shared normalizer.
- Run tests on both Ubuntu and Windows in CI while keeping lint/build on Ubuntu
  only.

## Test Plan

- Add unit coverage for the station path resolver on Windows-style host mounts
  and manifest-root resolution.
- Add unit coverage for the snapshot normalizer so wrapper and env noise
  collapse to one canonical form.
- Re-run the affected behavior suites and update snapshots only after the shared
  abstractions are in place.
- Run the full test suite locally and in CI across Ubuntu and Windows.

## Assumptions

- Snapshot differences are caused by OS-specific path and command-rendering
  noise, not by intended behavior differences.
- A single canonical snapshot baseline should serve both Windows and Ubuntu.
- Existing branch-local edits in the station runtime were exploratory and can be
  folded into the shared abstractions.
