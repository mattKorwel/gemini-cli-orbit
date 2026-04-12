# Orbit Manual Verification Plan 🛰️

This document outlines the step-by-step commands required to manually verify the
three core operational modes of Gemini Orbit. The critical P0 requirement is
that **attaching to a mission and using Gemini fully functional** succeeds in
all three environments.

**Before starting:** Ensure your project is built and linked.

```bash
npm run build
```

**Remote GCE prerequisite:** Pulumi uses Google Application Default Credentials,
so before running the remote flow you must complete:

```bash
gcloud auth application-default login
```

---

## 1. Local Worktree (Fast Path)

This mode uses your local machine's tmux and node environment directly,
bypassing Docker.

### 🚀 Launch & Attach

```bash
node bundle/orbit-cli.js mission start test-local-worktree chat --local
```

_Expected:_ A new tmux session should open immediately. You should be in a new
git worktree folder.

### 🧠 Verify Gemini Functionality (Inside the tmux session)

```bash
gemini "Write a python script that prints hello world"
```

_Expected:_ Gemini should respond correctly, proving auth and environment
variables are properly inherited. _(Detach from tmux: `Ctrl+B`, then `d`)_

### 💓 Pulse Check (On Host)

```bash
node bundle/orbit-cli.js constellation --pulse
```

_Expected:_ You should see the `test-local-worktree` mission listed as active
under a local station.

### 🌊 Splashdown

```bash
node bundle/orbit-cli.js infra splashdown
```

_Expected:_ The tmux session is killed, and the worktree directory is removed.

---

## 2. Local Docker (Containerized Starfleet)

This mode runs the Starfleet Supervisor and Worker capsules in Docker on your
local machine.

### 🛸 Start Supervisor (Background)

Open a separate terminal window and leave this running:

```bash
npm run local:station
```

### 🚀 Launch & Attach

In your main terminal:

```bash
npm run local:chat:docker
```

_Expected:_ The CLI should communicate with the local API. A worker container
should be spawned, and you should be attached to a tmux session _inside_ that
container.

### 🧠 Verify Gemini Functionality (Inside the tmux session)

```bash
gemini "What is the capital of France?"
```

_Expected:_ Gemini should respond correctly, proving the `.gemini` host mount
and network access inside the Docker network are functioning. _(Detach from
tmux: `Ctrl+B`, then `d`)_

### 💓 Pulse Check (On Host)

```bash
npm run fleet:pulse
```

_Expected:_ The `test-local-docker` mission should be listed as active under the
`local` station.

### 🌊 Splashdown

```bash
npm run infra:splashdown
```

_Expected:_ The worker container (`orbit-test-local-docker-...`) is forcefully
removed via the API. (You can stop the supervisor script in the other terminal
via `Ctrl+C`).

---

## 3. Remote GCE (Full Cloud Starfleet)

This is the full production path, provisioning real cloud infrastructure via
Pulumi.

### 🏗️ Provision Station (Liftoff)

```bash
node bundle/orbit-cli.js infra liftoff test-station --schematic korwel-fresh
```

_Expected:_ Pulumi provisions or wakes the named GCE VM from the selected
schematic. With `manageNetworking: false`, Orbit reuses the named VPC/subnet
from the schematic instead of creating fresh networking.

### 🚀 Launch & Attach

```bash
node bundle/orbit-cli.js mission start test-remote-gce chat --for-station test-station
```

_Expected:_ The CLI communicates with the remote API over an SSH tunnel. A
worker container is spawned on the VM, and you are attached via SSH/tmux.

### 🧠 Verify Gemini Functionality (Inside the remote tmux session)

```bash
gemini "List the files in the current directory and summarize what they do"
```

_Expected:_ Gemini should run, read the cloned workspace files, and respond.
This proves BeyondCorp/NAT networking and auth syncing are fully operational on
the VM. _(Detach from tmux: `Ctrl+B`, then `d`)_

### 💓 Pulse Check (On Host)

```bash
node bundle/orbit-cli.js constellation --pulse
```

_Expected:_ The `test-remote-gce` mission is listed under the `test-station`
node.

### 🌊 Splashdown (Nuclear Option)

```bash
node bundle/orbit-cli.js infra splashdown --all
```

_Expected:_ You will be prompted for confirmation. It will tear down the Pulumi
infrastructure, deleting the VM and data disk.
