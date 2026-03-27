# Orbit Mission: Liftoff (/orbit:liftoff)

The **Liftoff** command is your initial gateway to the Orbital environment. It provisions your Host Station and establishes your persistent digital presence.

## 🚀 Liftoff Process
Run the command in your local repository to begin the initialization:
```bash
/orbit:liftoff
```

### 1. Station Provisioning
Liftoff will guide you through the creation of your persistent GCE instance (or other custom host). It will:
- **Configure Networking**: Establish your preferred connectivity (`direct-internal`, `secure-tunnel`, or `external`).
- **Setup Storage**: Provision a high-performance PD-Balanced data disk (minimum 200GB recommended).
- **Initialize Security**: Configure OS Login and prepare the host for secure SSH access.

### 2. Digital Identity Synchronization
Your local credentials and configuration are mirrored to the station:
- **Gemini Auth**: Syncs your `google_accounts` or API keys.
- **GitHub Auth**: Securely uploads your Personal Access Token (PAT) for remote Git operations.
- **Extensions**: Synchronizes and links your installed Gemini extensions.

### 3. Repository Mirroring
Liftoff creates a "Source of Truth" mirror of your current repository on the Host Station. This mirror serves as the reference point for all future Mission Capsules, ensuring that branch checkouts and PR environments are created in seconds.

## 🛠️ Reconfiguring a Mission
If you need to change your infrastructure profile (e.g., switching from `sandbox` to `corp`), run:
```bash
/orbit:liftoff --reconfigure
```

## ✨ Quick Tips
- **Profiles**: You can save your infrastructure settings as **Profiles** to reuse them across multiple repositories.
- **Interactive Prompts**: Liftoff will detect existing settings and ask to reuse them by default. Use the `--yes` flag for a non-interactive setup.
