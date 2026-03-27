# Orbit Configuration: Tiered Resolution Hierarchy

Orbit utilizes a sophisticated configuration system designed for flexibility and security. Settings are merged from multiple sources to determine the final mission parameters.

## 🎚️ Resolution Hierarchy
Settings are resolved in the following order (highest priority first):

1.  **Environment Variables**: `GCLI_ORBIT_*` (Overrides everything).
2.  **Global Repository Registry**: Personal user settings for a specific repo in `~/.gemini/orbit/settings.json`.
3.  **Named Profiles**: Infrastructure-specific templates stored in `~/.gemini/orbit/profiles/*.json`.
4.  **Global Default Profile**: The `activeProfile` defined in global settings.
5.  **Project Defaults**: Tracked in the repository at `.gemini/orbit/config.json`.

---

## 🛠️ Configuration Sources

### 1. Project Defaults (`.gemini/orbit/config.json`)
These settings are shared by all developers working on the repository. They define the "Sovereign Target" for the mission.
```json
{
  "upstreamRepo": "google-gemini/gemini-cli",
  "remoteWorkDir": "/mnt/disks/data/main",
  "useContainer": true,
  "imageUri": "us-docker.pkg.dev/gemini-code-dev/gemini-cli/development:latest",
  "terminalTarget": "tab"
}
```

### 2. Global Settings (`~/.gemini/orbit/settings.json`)
This file stores your personal repository links and global preferences.
```json
{
  "activeProfile": "corp",
  "repos": {
    "gemini-cli": {
      "profile": "sandbox",
      "userFork": "my-user/gemini-cli"
    }
  }
}
```

### 3. Named Profiles (`~/.gemini/orbit/profiles/`)
Profiles allow you to switch between different infrastructure environments (e.g., `corp`, `sandbox`, `local-lab`).
```json
{
  "projectId": "my-personal-project",
  "zone": "us-west1-a",
  "vpcName": "default",
  "subnetName": "default",
  "backendType": "direct-internal"
}
```

---

## 🚀 Environment Variable Overrides

For temporary overrides, use the following environment variables:
- `GCLI_ORBIT_PROJECT_ID`: Override the cloud project ID.
- `GCLI_ORBIT_ZONE`: Override the infrastructure zone.
- `GCLI_ORBIT_INSTANCE_NAME`: Override the name of the Host Station.
- `GCLI_ORBIT_BACKEND`: Override connectivity type (`direct-internal`, `external`, `iap`).
- `GCLI_ORBIT_IMAGE`: Override the capsule Docker image.

---

## 🏗️ Cloud-Agnostic Extension

Orbit is built to be provider-independent. To support a new infrastructure (e.g., AWS, Azure, Local Docker), you can implement a custom **Station Provider**.

1.  Create a new class implementing the `OrbitProvider` interface in `scripts/providers/`.
2.  Register your provider in the `ProviderFactory.ts`.
3.  Specify your provider type in your profile:
    ```json
    {
      "providerType": "my-custom-provider"
    }
    ```

Every provider must implement core lifecycles: `provision`, `setup`, `ensureReady`, `exec`, and `sync`.
