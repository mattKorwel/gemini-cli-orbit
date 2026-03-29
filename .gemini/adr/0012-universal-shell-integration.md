# ADR 0012: Universal Shell Integration & CLI Dispatcher

## Status
Accepted

## Context
Running Gemini Orbit commands previously required prefixing everything with `gemini orbit`, which was verbose and didn't provide native shell features like tab-completion or detailed subcommand help. Developers need a fast, low-friction way to interact with Orbit directly from their terminal.

## Decision
Implement a dedicated `orbit` CLI dispatcher and an automated shell integration system.

### 1. The `orbit` Shim Dispatcher (`scripts/orbit-shim.ts`)
- **Central Entrypoint**: A single TypeScript script that maps subcommands (`mission`, `ci`, `pulse`, etc.) to their respective implementation scripts.
- **Path Resolution**: Automatically resolves absolute paths to the extension source (`scripts/*.ts` via `tsx`) or bundled distribution (`bundle/*.js` via `node`).
- **Help System**: Provides a built-in `-h/--help` menu describing all available subcommands and flags.
- **Exit Code Propagation**: Ensures the exit status of the underlying script is correctly returned to the shell.

### 2. Multi-Shell Autocompletion
- **Native Integration**: Support for `zsh`, `bash`, `fish`, and `powershell`.
- **Rich Completions (Zsh)**: Uses `_describe` to provide both subcommand names and their descriptions during tab-completion.
- **Standard Completions**: Uses shell-native completion primitives (`compgen`, `Register-ArgumentCompleter`, `complete`) for other shells.

### 3. Automated Installation (`scripts/utils/ShellIntegration.ts`)
- **Profile Detection**: Automatically identifies the user's shell and target profile (e.g., `.zshrc`, `.bash_profile`, `$PROFILE`).
- **Safety First**: Creates a timestamped backup of the existing profile (e.g., `.zshrc.bak.2026-03-28T17-35-00`) before performing any modifications.
- **Idempotent Updates**: Uses a comment marker (`# Gemini Orbit Shell Integration`) to manage the integration block, allowing for safe re-installation or updates.
- **Opt-in during Setup**: The `orbit liftoff` (setup) process includes a mandatory prompt for shell integration, with a `--shell-integration` flag for automation.

## Rationale
- **Velocity**: Reduces typing from `gemini orbit mission` to `orbit mission`.
- **Discoverability**: Tab-completion and the help menu make it easier for new users to explore available Orbit capabilities without reading documentation.
- **Portability**: Working across all major shells ensures a consistent experience regardless of the developer's OS or shell preference.
- **Maintainability**: The shim allows the internal directory structure or execution method (node vs tsx) to change without requiring users to update their shell aliases.

## Consequences
- **Positive**: Significantly improved developer ergonomics and faster command execution.
- **Neutral**: Adds a small dependency on `tsx` for the shim when running from source, which is already a project requirement.
- **Neutral**: Modifies the user's shell profile (with explicit consent).
