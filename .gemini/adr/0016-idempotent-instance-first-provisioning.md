# ADR 0016: Idempotent Instance-First Provisioning

## Status

Accepted

## Context

The Orbit CLI previously conflated infrastructure "Schematics" (blueprints) with
"Stations" (instances). Commands like `orbit station liftoff <schematic>` used
the blueprint name as the primary identifier, which caused confusion when a user
wanted to provision multiple stations from the same blueprint or give their
station a human-friendly name.

Additionally, the `liftoff` command was not strictly idempotent, leading to
redundant flags like `--with-new-station`.

## Decision

Re-orient the Orbit lifecycle around the **Station Instance Name** and enforce
idempotent provisioning.

### 1. Instance as Primary Identifier

- The primary positional argument for `liftoff` and `station` commands is always
  the `instanceName`.
- This name maps directly to the Pulumi Stack Name, ensuring that multiple
  stacks can exist for a single schematic.
- A schematic is provided as an optional blueprint via the `--schematic` flag.

### 2. Idempotent Liftoff

- The `liftoff` command is idempotent:
  - If no station exists with the given name, it is provisioned from the
    schematic.
  - If the station exists but is hibernated, it is woken up.
  - If the station exists and is running, the configuration and supervisor state
    are verified.

### 3. Separation of Concerns

- **Liftoff**: A top-level command for provisioning and initial setup.
- **Station**: A command group for managing established hardware lifecycle
  (list, activate, hibernate, delete).

## Rationale

- **UX Clarity**: Eliminates positional argument shadowing and ambiguity.
- **Flexibility**: Allows users to manage multiple independent environments
  using standardized blueprints.
- **Efficiency**: Reduces CLI friction by making `liftoff` the single "make it
  work" command for a station.

## Consequences

- **Positive**: Significantly more intuitive CLI syntax.
- **Positive**: Clean separation between infrastructure code (Pulumi) and
  hardware state (Station Receipts).
- **Neutral**: Requires migration of existing station receipts and Pulumi state
  directory names to match the new instance-first model.
