---
name: Imported toolchain pins
description: Why package-manager auto-switching is disabled for this import.
---

Prefer the provisioned pnpm 10 over automatic installation of the imported package-manager pin.

**Why:** On this Replit environment, automatic pnpm version switching recursively invoked its own install until it aborted. Upgrading Node to the declared minimum did not resolve this; disabling automatic switching did. The frozen lockfile installed successfully with the provisioned pnpm.

**How to apply:** When updating package-manager versions, explicitly verify that a clean dependency install succeeds before re-enabling automatic version switching.
