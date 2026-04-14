# Getting Started With Gemini Orbit 🛰️

Orbit transforms Gemini into a distributed engineering platform. It allows you
to run persistent, autonomous "missions" on remote hardware or local containers.

This guide will take you from zero to your first remote mission in 5 steps.

---

## 🚀 The 5-Step Golden Path

### 1. Install the Extension
Add Orbit to your Gemini CLI environment:

```bash
gemini extensions install https://github.com/mattKorwel/gemini-cli-orbit.git
```

### 2. Install Shell Integration
Orbit provides its own CLI. You must install the `orbit` command into your shell
profile (`.zshrc` or `.bashrc`):

```bash
node ~/.gemini/extensions/orbit/bundle/orbit-cli.js config install
# Restart your terminal or source your profile
```

### 3. Choose Your Schematic
Orbit uses "Schematics" as blueprints for your hardware. Two templates are
pre-seeded for you:
- **`google`**: Optimized for internal corporate networks (BeyondCorp).
- **`personal-gcp`**: Optimized for standard personal GCP projects.

### 4. Configure Your Project ID
Before liftoff, you must point the schematic to your actual GCP project. Run the
wizard headlessly:

```bash
# If you are on a corporate setup:
orbit infra schematic edit google --projectId <YOUR_PROJECT_ID>

# For personal sandboxes:
# (Strongly recommended to also lock down SSH access to your current IP)
orbit infra schematic edit personal-gcp --projectId <YOUR_PROJECT_ID> --sshSourceRanges <YOUR_PUBLIC_IP>/32
```

> **💡 Pro Tip**: For personal GCP projects, run `npm run infra:gcp:prep -- --apply` to
> automatically enable APIs, generate SSH keys, and setup your schematic.

### 5. Achieving Liftoff
Now, provision and wake your remote hardware. This command is idempotent—run it
any time to wake or update your station:

```bash
orbit infra liftoff my-station --schematic <google|personal-gcp>
```

**✅ Success!** Your station is now ready to host missions.

---

## 🏗️ Launching Your First Mission

Once your station is "READY" (check with `orbit constellation`), you can delegate
work to it. Missions are identified by a PR ID, Issue ID, or custom name.

```bash
# Launch a persistent chat session on your new station
orbit mission launch my-first-mission chat --for-station my-station
```

### Common Maneuvers
- `orbit mission launch 123 review`: Start an autonomous PR review.
- `orbit mission launch 456 fix`: Start an iterative bug-fix mission.
- `orbit mission attach 123`: Jump back into an active session.

---

## 💡 Tips for Corporate Users

- **Networking**: Always use the `google` schematic. It handles internal
  corporate DNS (`internal.gcpnode.com`) and VPC requirements automatically.
- **IAP**: Do not use Gcloud IAP flags. Orbit uses a direct SSH relay that is
  significantly more stable in corporate environments.
- **Project Setup**: Ensure your project has the Compute Engine API enabled and
  that you have `Editor` permissions.

---

## 🔭 Next Reads

- [Schematics Guide](./SCHEMATICS.md): Learn how to customize your blueprints.
- [Liftoff Guide](./LIFTOFF.md): Deep dive into hardware provisioning.
- [Mission Guide](./MISSION.md): Master the mission lifecycle.
- [Testing Guide](./TESTING.md): How to verify your setup.
