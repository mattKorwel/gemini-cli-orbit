# Orbit Configuration: Tiered Resolution Hierarchy

Orbit utilizes a sophisticated configuration system designed for flexibility and
security. Settings are merged from multiple sources to determine the final
mission parameters.

## 🏗️ Configuration Split: Schematic vs. Station

To ensure reusable infrastructure and maintainable repository settings, Orbit
separates configuration into two distinct layers:

1.  **Orbit Schematic (Environment)**: Global infrastructure templates (e.g.,
    `corp`, `sandbox`) that define _where_ missions run.
2.  **Station Schematic (Repository)**: Repository-specific links and overrides
    that define _how_ a specific repo interacts with a Schematic.

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

#### 🌐 Networking Modes

Orbit supports two distinct networking strategies for cloud stations:

1.  **Managed Networking (`manageNetworking: true`)**:
    - **Recommended** for isolation.
    - Orbit automatically creates a dedicated VPC, Subnet, Cloud Router, and NAT
      Gateway for the station.
    - VPC and Subnet names are dynamically generated based on the instance name
      to prevent collisions.
    - Do **not** provide `vpcName` or `subnetName` in the schematic when using
      this mode.

2.  **Pre-existing Networking (`manageNetworking: false`)**:
    - Use this if you want to place your station in an existing corporate or
      shared VPC.
    - You **must** provide `vpcName` and `subnetName` in the schematic.
    - Orbit will only provision the VM and ensure firewall rules are present in
      the specified network.

**Managing Schematics via CLI**:

- **List available schematics**: `orbit schematic list`
- **Create/Edit a schematic**: `orbit schematic create <name>`
- **Import a schematic**: `orbit schematic import <path|url>`

**Managing Stations via CLI**:

- **List active stations**: `orbit station list`
- **Activate a station**: `orbit station activate <name>`
- **Initial station setup**: `orbit station liftoff`

**Key Attributes**:

- `projectId`: The Cloud Project ID (e.g., `my-cloud-project`).
- `zone`: The Cloud Zone (e.g., `us-west1-a`).
- `machineType`: The Cloud Machine Type (e.g., `n2-standard-8`).
- `networkAccessType`: Connectivity method (`direct-internal`, `external`).
- `vpcName`: The target VPC.
- `subnetName`: The target Subnet.
- `sshSourceRanges`: (Optional) Array of CIDR blocks allowed to connect via SSH.
  Defaults to `["0.0.0.0/0"]`.

---

## 🏎️ CLI Configuration Flags

You can provide configuration flags directly to many Orbit commands. These flags
serve two primary purposes:

1.  **Wizard Pre-fill**: When running `orbit schematic create <name>`, flags
    like `--projectId=my-project` will pre-populate the interactive wizard
    fields.
2.  **Runtime Overrides**: When running `orbit station liftoff`, flags act as
    immediate overrides for the current execution, bypassing settings in your
    Schematic or Project config.

### Supported Flags

| Flag                    | Schematic Property  | Description                                     |
| ----------------------- | ------------------- | ----------------------------------------------- |
| `--projectId`           | `projectId`         | The Cloud Project ID.                           |
| `--zone`                | `zone`              | The Cloud Zone (e.g., `us-central1-a`).         |
| `--instanceName`        | `instanceName`      | The name of the Station.                        |
| `--network-access-type` | `networkAccessType` | `direct-internal` or `external`.                |
| `--machineType`         | `machineType`       | The Cloud Machine Type (e.g., `n2-standard-8`). |
| `--vpcName`             | `vpcName`           | The target VPC network name.                    |
| `--subnetName`          | `subnetName`        | The target Subnet name.                         |
| `--image`               | `imageUri`          | The Docker image for mission capsules.          |
| `--schematic`           | N/A                 | The name of the schematic to use.               |
| `--for-station`         | N/A                 | Target a specific station by name.              |

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
