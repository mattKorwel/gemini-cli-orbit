# Orbit Documentation

This is the main index for the Gemini Orbit docs set.

## Start Here

| Doc                                       | Why Read It                                                                            |
| :---------------------------------------- | :------------------------------------------------------------------------------------- |
| [Getting Started](./GETTING_STARTED.md)   | The fastest way to understand what Orbit is, why you would use it, and how to begin.   |
| [Commanding Orbit](./COMMANDING_ORBIT.md) | How Orbit is driven from direct CLI commands, natural language in Gemini CLI, and MCP. |
| [Configuration](./CONFIGURATION.md)       | How project config, global settings, schematics, and station blueprints fit together.  |

## Core Workflows

| Doc                         | Focus                                           |
| :-------------------------- | :---------------------------------------------- |
| [Liftoff](./LIFTOFF.md)     | Provision or wake hardware and supervisors.     |
| [Mission](./MISSION.md)     | Launch, attach, inspect, and clean up missions. |
| [Attach](./ATTACH.md)       | Re-attach to a running mission session.         |
| [Pulse](./PULSE.md)         | Inspect fleet and mission state.                |
| [Jettison](./JETTISON.md)   | Remove mission-specific resources.              |
| [Maneuvers](./MANEUVERS.md) | Review, fix, and implement mission patterns.    |

## Concepts And Internals

| Doc                               | Focus                                           |
| :-------------------------------- | :---------------------------------------------- |
| [Architecture](./ARCHITECTURE.md) | Orbit runtime roles and execution flow.         |
| [Providers](./PROVIDERS.md)       | Local and remote execution/provider modes.      |
| [Gemini Guidance](./GEMINI.md)    | Strategic guidance for using Orbit with Gemini. |
| [Dependencies](./DEPENDENCIES.md) | External tooling and environment assumptions.   |
| [Security](./SECURITY.md)         | Isolation model and credential handling.        |

## Setup, Validation, And Operations

| Doc                                                               | Focus                                          |
| :---------------------------------------------------------------- | :--------------------------------------------- |
| [Manual Testing](./MANUAL_TESTING.md)                             | Smoke tests for local and remote flows.        |
| [Test Plan](./test-plan.md)                                       | Structured validation scenarios.               |
| [Personal GCP Public IP Setup](./PERSONAL_GCP_PUBLIC_IP_SETUP.md) | Public-IP-oriented personal GCP guidance.      |
| [Day In The Life](./DAY_IN_THE_LIFE.md)                           | Example operator workflow across a normal day. |

## Reference

| Doc                                               | Focus                                              |
| :------------------------------------------------ | :------------------------------------------------- |
| [Container Paths](./reference/container-paths.md) | Expected in-container paths and runtime contracts. |
| [Host Mounts](./reference/host-mounts.md)         | Host-to-capsule mount expectations.                |

## Archive

| Doc                                                           | Focus                              |
| :------------------------------------------------------------ | :--------------------------------- |
| [Remote Transport Notes](./archive/remote-transport-notes.md) | Archived planning/reference notes. |
| [cmd-ssh.txt](./archive/cmd-ssh.txt)                          | Archived ad hoc command reference. |
