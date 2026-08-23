# Direct Dependency Register

Every direct dependency must be exact-pinned in `package.json` and explained here.

## Runtime dependencies

None in PR-00.

## Development dependencies

### `typescript` 6.0.3

Purpose: static type checking and deterministic compilation for the Node/TypeScript foundation.

Why not TypeScript 7 in PR-00: 7.x is a major native-toolchain transition. PR-00 chooses the serviced 6.0 bridge line to minimize bootstrap/tooling uncertainty. Upgrade requires a bounded compatibility PR, not ambient drift.

### `@types/node` 24.11.2

Purpose: Node 24 API typings aligned with the pinned Node 24 runtime family.

## Package manager

npm from the pinned Node 24.19.0 distribution. No alternate package manager is required in V0.
