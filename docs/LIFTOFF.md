# Orbit Mission: Liftoff (/orbit:liftoff)

The **Liftoff** command is your initial gateway to the Orbital environment. It
provisions your Host Station and establishes your persistent digital presence.

## 🚀 Liftoff Process

Run the command in your local repository to begin the initialization:

```bash
/orbit:liftoff
```

### 1. Orbit Design Selection

Liftoff will ask you to select an **Orbit Design** (Infrastructure Template). If
no designs exist, it will guide you through creating your `default` environment
(Project, Zone, VPC).

### 2. Station Configuration

Once the environment is selected, Liftoff configures your repo-specific
**Station**:

- **Station Name**: The unique identifier for your remote VM.
- **Machine Type**: Choose the performance tier (e.g., `n2-standard-8`).
- **Image**: Select the Orbit Docker image for your capsules.

### 3. Identity & Repository Mirroring

Your local credentials and configuration are mirrored to the station:

- **Gemini Auth**: Syncs your `google_accounts` or API keys.
- **GitHub Auth**: Securely stores your repository PAT in global storage
  (`~/.gemini/orbit/tokens/`).
- **Source Mirror**: Creates a "Source of Truth" mirror of your repo on the Host
  Station for fast capsule creation.

## 🛠️ Reconfiguring

If you need to change your station settings (e.g., switching to a bigger
machine), run:

```bash
/orbit:liftoff --reconfigure
```

To update the global infrastructure template itself, use the dedicated command:

```bash
/orbit:profile
```

## ✨ Quick Tips

- **Designs**: Reusable infrastructure templates that can be shared across
  multiple repositories.
- **Surgical Mode**: Provide any flag (e.g., `--gce-machine-type=n2-highmem-16`)
  to skip interactive prompts and apply the change immediately.
