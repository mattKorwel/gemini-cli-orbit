# Plan: Formalizing the Gemini Orbits Extension

## Objective

Convert the current script-based system into a formal Gemini CLI extension that
supports installation, slash commands, and automated discovery.

## 1. Directory & Documentation Cleanup

- [ ] Copy all remaining local plans/ADRs to `.gemini/adr/` in the extension
      repository (ensure they remain as persistent artifacts in the original
      location).
- [ ] Ensure `docs/GEMINI.md` reflects the final "Multi-Container" architecture.

## 2. Command Registration

Create a `commands/orbit/` directory to house namespaced slash commands.

### Commands to implement:

- **`/orbit:setup`**: Wrapper for `scripts/setup.ts`.
- **`/orbit:open <pr>`**: Wrapper for `scripts/orchestrator.ts`.
- **`/orbit:status`**: Wrapper for `scripts/status.ts`.
- **`/orbit:clean`**: Wrapper for `scripts/clean.ts`.
- **`/orbit:logs <pr>`**: Wrapper for `scripts/logs.ts`.
- **`/orbit:fleet <action>`**: Wrapper for `scripts/fleet.ts`.

## 3. Manifest & Packaging

- [ ] Update `gemini-extension.json` with accurate versioning and author info.
- [ ] Add a root `README.md` with installation instructions:
      `gemini extensions install https://github.com/mattKorwel/gemini-orbits-extension.git`

## 4. Verification

- [ ] Run `gemini extensions validate .`
- [ ] Perform a local link: `gemini extensions link .`
- [ ] Test the slash commands in a live session (e.g., `/orbit:status`).

## 5. Security Check

- [ ] Ensure that the `prompt` defined in the `.toml` files doesn't
      inadvertently log secrets.
- [ ] Verify that the `!{...}` execution blocks correctly handle the `npx tsx`
      environment.
