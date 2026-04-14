# Orbit Configuration: Tiered Resolution Hierarchy

Orbit utilizes a sophisticated configuration system designed for flexibility and
security. Settings are merged from multiple sources to determine the final
mission parameters.

## 🏗️ Configuration Split: Schematics, Registry, And Station Blueprints

Orbit currently splits configuration into a few distinct layers:

1. **Project Defaults**: Repository-local defaults under
   `.gemini/orbit/config.json`.
2. **Global Registry**: User-level settings and active-station links under
   `~/.gemini/orbit/settings.json`.
3. **Schematics**: Named infrastructure templates under
   `~/.gemini/orbit/schematics/*.json`.
4. **Station Blueprints**: Runtime contracts in `configs/station.local.json` and
   `configs/station.starfleet.json`.

### 🛰️ Starfleet Station Blueprints

Orbit now uses specialized blueprints for different station environments,
located in the `configs/` directory. These define the "contract" between the
supervisor and the capsules.

- **`configs/station.local.json`**: Configuration for the local Starfleet
  supervisor. Defines mount points for your local machine.
- **`configs/station.starfleet.json`**: The standard production blueprint used
  on GCE stations.

---

## 🛠️ Configuration Sources

### 1. Project Defaults (`.gemini/orbit/config.json`)

These settings are shared by all developers working on the repository. They
define the "Sovereign Target" for the mission.

The default Docker image is defined in the source code:

<!-- @include ../src/core/Constants.ts:DEFAULT_IMAGE_URI -->

```ts
export const DEFAULT_IMAGE_URI =
  'us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest';
```

```json
{
  "upstreamRepo": "google-gemini/gemini-cli",
  "remoteWorkDir": "/mnt/disks/data/main",
  "useContainer": true,
  "imageUri": "us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest", // Default resolved from Constants.ts
  "terminalTarget": "tab"
}
```

### 2. Global Registry (`~/.gemini/orbit/settings.json`)

This file tracks your personal stations across all repositories and manages your
active Station.

```json
{
  "activeRepo": "gemini-cli",
  "activeStation": "orbit-station-mattkorwel",
  "repos": {
    "gemini-cli": {
      "instanceName": "orbit-station-mattkorwel",
      "schematic": "corp"
    }
  }
}
```

### 3. Orbit Schematics (`~/.gemini/orbit/schematics/*.json`)

Schematics allow you to switch between different infrastructure environments
(e.g., `corp`, `sandbox`, `local-lab`).

**Built-in Templates**:
Orbit automatically seeds a few standard templates into your schematics directory
to help you get started:

- **`google`**: Optimized for internal Google corporate projects. Uses
  `direct-internal` networking and standard internal DNS suffixes.
- **`personal-gcp`**: Optimized for fresh personal GCP projects. Uses
  `external` networking and the default VPC.

#### 🌐 Networking Modes

Orbit supports two distinct networking strategies for cloud stations:

1.  **Isolated Networking (`useDefaultNetwork: false`)**:
    - **Recommended** for isolation and ease of setup.
    - Orbit automatically creates a dedicated VPC, Subnet, Cloud Router, and NAT
      Gateway for the station.
    - VPC and Subnet names are dynamically generated based on the instance name
      to prevent collisions.
    - You can still provide `vpcName` or `subnetName` to override the generated
      names while remaining in isolated mode.

2.  **Shared/Default Networking (`useDefaultNetwork: true`)**:
    - Use this if you want to place your station in the GCP `default` VPC or a
      pre-existing shared network.
    - If you provide `vpcName` and `subnetName`, Orbit will use those. Otherwise
      it defaults to `default`.
    - Orbit will ensure SSH firewall rules are present in the specified network
      if `manageFirewallRules` is enabled.

**Managing Schematics via CLI**:

- **List available schematics**: `orbit infra schematic list`
- **Show one schematic**: `orbit infra schematic show <name>`
- **Import a schematic**: `orbit infra schematic import <path|url>`
- **Create a schematic**: `orbit infra schematic create <name>`
- **Edit a schematic**: `orbit infra schematic edit <name>`

**Managing Stations via CLI**:

- **Activate a station**: `orbit station activate <name>`
- **Provision or wake a station**:
  `orbit infra liftoff <name> --schematic <name>`
- **Decommission a station**: `orbit infra splashdown <name>` or
  `orbit station delete <name>`

**Personal GCP bootstrap today**:

- The repo currently ships a prep script at `npm run infra:gcp:prep`.
- That script prepares a recommended personal-project schematic by detecting your public IP for secure SSH ingress.
- There is not yet a first-class `orbit infra prepare ...` CLI command.

**Key Attributes**:

- `projectId`: The Cloud Project ID (e.g., `my-cloud-project`).
- `zone`: The Cloud Zone (e.g., `us-west1-a`).
- `machineType`: The Cloud Machine Type (e.g., `n2-standard-8`).
- `networkAccessType`: Connectivity method (`direct-internal`, `external`).
- `useDefaultNetwork`: (Boolean) Whether to use the GCP default network.
- `manageFirewallRules`: (Boolean) Whether Orbit should manage SSH firewall rules.
- `vpcName`: The target VPC (Used if `useDefaultNetwork` is true, or to override isolation name).
- `subnetName`: The target Subnet (Used if `useDefaultNetwork` is true, or to override isolation name).
- `sshSourceRanges`: (Optional) Array of CIDR blocks allowed to connect via SSH.
  Defaults to `["0.0.0.0/0"]` for external access.
- `allowDevUpdates`: (Boolean) Whether to unlock the station for development updates.

---

## 🏎️ Current CLI Surface

The current public schematic command surface is:

```bash
orbit infra schematic list
orbit infra schematic show <name>
orbit infra schematic import <path-or-url>
orbit infra schematic create <name>
orbit infra schematic edit <name>
```

The `orbit infra schematic --help` output currently exposes:

- schematic actions (`list`, `show`, `import`, `create`, `edit`)
- source-context flags (`--local`, `--repo`, `--repo-dir`)
- global flags (`--verbose`, `--json`, `--yes`)

If you need one-shot environment bootstrapping for personal GCP, use
`npm run infra:gcp:prep` and then provision with `orbit infra liftoff`.

---

## 🎯 Project Selection Shorthand

Orbit supports a powerful shorthand for targeting a specific repository's
configuration without providing explicit flags:

**Syntax**: `orbit <repo-name>:<command> [args]`

When you use a colon in the first argument, Orbit treats the prefix as the
**logical repository name**.

### How it Works

1.  **Sets `GCLI_ORBIT_REPO_NAME`**: The prefix (e.g., `my-service`) is used to
    look up settings in your Global Registry.
2.  **Routes the Command**: The suffix (e.g., `mission`) is executed as the
    primary command.
3.  **Interaction with `--repo-dir`**:
    - The shorthand specifies **who** (which configuration/station to use).
    - The `--repo-dir` flag (or the current directory) specifies **where** the
      source code is physically located on your disk.

**Example**:

```bash
# Launch mission 123 for the 'api-server' project, using code in a specific folder
orbit api-server:mission 123 --repo-dir ~/clones/api-v2
```

This is equivalent to:

```bash
orbit mission 123 --repo api-server --repo-dir ~/clones/api-v2
```

---

## 4. Environment Variables

Highest priority overrides for the current session.

- `GCLI_ORBIT_PROJECT_ID`
- `GCLI_ORBIT_ZONE`
- `GCLI_ORBIT_INSTANCE_NAME`
- `GCLI_ORBIT_NETWORK_ACCESS`
- `GCLI_ORBIT_IMAGE`
- `GCLI_ORBIT_TEMP_DIR`: Override the base directory for session-specific
  temporary data.
- `GCLI_ORBIT_AUTO_CLEAN`: (true/false) Whether to delete temporary session
  directories after completion.

---

## 📂 Temporary Output Management

Orbit generates transient data during missions (e.g., iTerm2 launch scripts,
Cloud startup scripts). This data is isolated by **Session ID** and stored in a
configurable location.

**Default Location**: `~/.gemini/orbit/tmp/<session-id>/`

### Configuration Options

- **`tempDir`**: The base directory for all Orbit temporary data.
- **`autoClean`**: If `true` (default), Orbit will automatically delete the
  session-specific folder once its primary task (like launching a terminal or
  provisioning a station) is complete.

---

## 🚀 Advanced: Architecture

### Infrastructure Provisioners

Orbit separates "building the hardware" from "running the code".

- **Provisioners** (`src/infrastructure/`): Manage cloud resources declaratively
  using Pulumi.
- **Execution Providers** (`src/providers/`): Manage command execution and
  capsules on the provisioned hardware.

See [DEPENDENCIES.md](DEPENDENCIES.md) for details on the Pulumi requirement.
