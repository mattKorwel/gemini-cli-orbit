# Gemini Workspaces Extension

High-performance remote development workspaces for Gemini CLI. This extension allows you to delegate heavy tasks (agentic fixes, long builds, complex reviews) to an isolated, high-performance GCP worker.

## Features
- **Process-Level Isolation**: Each session runs in its own dedicated, persistent container.
- **Security-First**: Read-only main repository access for job containers via Git Reference Clones.
- **Persistence**: Sessions live in `tmux` on the remote worker; your work survives local disconnects.
- **Fast Startup**: Optimized polling and SSH multiplexing ensure your workspace is ready in seconds.

## Installation

```bash
gemini extensions install https://github.com/google-gemini/gemini-workspaces-extension.git
```

## Quick Start

1. **Setup**: Initialize your remote environment and configure credentials.
   ```bash
   /workspace:setup
   ```

2. **Open**: Launch an isolated workspace for a specific PR.
   ```bash
   /workspace:open 23176
   ```

3. **Status**: Check your active jobs and container health.
   ```bash
   /workspace:status
   ```

## Commands
- `/workspace:setup`: Interactive environment configuration.
- `/workspace:open <pr>`: Launch/attach to a PR workspace.
- `/workspace:review <pr>`: Autonomous PR analysis and regression checking.
- `/workspace:fix <pr>`: Automated self-healing loop for CI failures.
- `/workspace:implement <issue>`: Research -> Test -> Fix loop for new features.
- `/workspace:status`: View Mission Control dashboard.
- `/workspace:clean <pr> <action>`: Surgically remove a job.
- `/workspace:clean --all`: Full remote reset.
- `/workspace:fleet <action>`: Manage the GCE worker (stop, destroy, provision).
- `/workspace:logs <pr>`: View remote job logs.

## Ported Skills
This extension includes specialized skills for automated development:
- **`ci`**: High-performance GitHub Actions monitoring.
- **`async-pr-review`**: Background triggers for PR reviews.
- **`fix-pr`**: Remote self-healing logic.
- **`review-pr`**: Systematic PR analysis.

## License
Apache-2.0
