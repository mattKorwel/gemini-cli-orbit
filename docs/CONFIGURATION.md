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

---

## 🛠️ Configuration Sources

### 1. Project Defaults (`.gemini/orbit/config.json`)

These settings are shared by all developers working on the repository. They
define the "Sovereign Target" for the mission.

The default Docker image is defined in the source code:

<!-- @include ../scripts/Constants.ts:DEFAULT_IMAGE_URI -->

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
  "activeStation": "gcli-station-mattkorwel",
  "repos": {
    "gemini-cli": {
      "instanceName": "gcli-station-mattkorwel",
      "schematic": "corp"
    }
  }
}
```

### 3. Orbit Schematics (`~/.gemini/orbit/schematics/*.json`)

Schematics allow you to switch between different infrastructure environments
(e.g., `corp`, `sandbox`, `local-lab`).

**Managing Schematics via CLI**:

- **List available schematics**: `orbit schematic list`
- **Create/Edit a schematic**: `orbit schematic create <name>`
- **Import a schematic**: `orbit schematic import <path|url>`

**Managing Stations via CLI**:

- **List active stations**: `orbit station list`
- **Activate a station**: `orbit station activate <name>`
- **Initial station setup**: `orbit station liftoff`

**Key Attributes**:

- `projectId`: The GCP Project ID.
- `zone`: The GCE Zone (e.g., `us-west1-a`).
- `machineType`: The GCE Machine Type (e.g., `n2-standard-8`).
- `backendType`: Connectivity method (`direct-internal`, `external`).
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

| Flag             | Schematic Property | Description                                   |
| ---------------- | ------------------ | --------------------------------------------- |
| `--projectId`    | `projectId`        | The Google Cloud Project ID.                  |
| `--zone`         | `zone`             | The GCE Zone (e.g., `us-central1-a`).         |
| `--instanceName` | `instanceName`     | The name of the GCE Station VM.               |
| `--backend`      | `backendType`      | `direct-internal` or `external`.              |
| `--machineType`  | `machineType`      | The GCE Machine Type (e.g., `n2-standard-8`). |
| `--vpcName`      | `vpcName`          | The target VPC network name.                  |
| `--subnetName`   | `subnetName`       | The target Subnet name.                       |
| `--image`        | `imageUri`         | The Docker image for mission capsules.        |
| `--schematic`    | N/A                | The name of the schematic to use.             |
| `--for-station`  | N/A                | Target a specific station by name.            |

**Note**: Use the `--key=value` syntax for all configuration flags.

---

## 4. Environment Variables

Highest priority overrides for the current session.

- `GCLI_ORBIT_PROJECT_ID`
- `GCLI_ORBIT_ZONE`
- `GCLI_ORBIT_INSTANCE_NAME`
- `GCLI_ORBIT_BACKEND`
- `GCLI_ORBIT_IMAGE`
- `GCLI_ORBIT_TEMP_DIR`: Override the base directory for session-specific
  temporary data.
- `GCLI_ORBIT_AUTO_CLEAN`: (true/false) Whether to delete temporary session
  directories after completion.

---

## 📂 Temporary Output Management

Orbit generates transient data during missions (e.g., iTerm2 launch scripts, GCE
startup scripts). This data is isolated by **Session ID** and stored in a
configurable location.

**Default Location**: `~/.gemini/orbit/tmp/<session-id>/`

### Configuration Options

- **`tempDir`**: The base directory for all Orbit temporary data.
- **`autoClean`**: If `true` (default), Orbit will automatically delete the
  session-specific folder once its primary task (like launching a terminal or
  provisioning a station) is complete.

---

## 🚀 Advanced: Custom Providers

You can create custom providers by extending the `OrbitProvider` interface:

1.  Create a new provider class in `scripts/providers/`.
2.  Register it in `ProviderFactory.ts`.
3.  Specify your provider type in your Schematic:
    ```json
    {
      "providerType": "my-custom-provider"
    }
    ```

Every provider must implement core lifecycles: `provision`, `setup`,
`ensureReady`, `exec`, and `sync`.
